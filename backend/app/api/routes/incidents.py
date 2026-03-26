from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query

from app.core.deps import require_role, get_current_user
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role, IncidentStatus
from app.models.incident import IncidentCreate, IncidentInDB, IncidentUpdate

router = APIRouter()


@router.post("/incidents", response_model=IncidentInDB)
async def create_incident(payload: IncidentCreate, user: dict = Depends(require_role(Role.UNIT_USER))):
    db = get_db()
    type_doc = await db.incident_types.find_one({"code": payload.typeCode})
    if not type_doc:
        raise HTTPException(status_code=404, detail="Incident type not found")

    priority = type_doc.get("defaultPriority", 1)
    setup_remote = type_doc.get("defaultSetupRemote", 0.5)

    unit = await db.units.find_one({"_id": oid(user["unitId"])})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    component = await db.components.find_one(
        {"_id": oid(payload.componentId), "companyId": user["companyId"], "unitId": user["unitId"]}
    )
    if not component:
        raise HTTPException(status_code=404, detail="Component not found for unit")

    mode_feas = {
        "R": bool(unit.get("remoteAccessReady")) and bool(type_doc.get("defaultFeasRemote", True)),
        "O": bool(type_doc.get("defaultFeasOnsite", True)),
    }

    doc = {
        "companyId": user["companyId"],
        "unitId": user["unitId"],
        "componentId": payload.componentId,
        "typeCode": payload.typeCode,
        "priority": priority,
        "status": IncidentStatus.OPEN.value,
        "reportedAt": datetime.now(timezone.utc),
        "modeFeas": mode_feas,
        "setupRemote": setup_remote,
        "requirements": type_doc.get("requirements", {}),
    }

    result = await db.incidents.insert_one(doc)
    created = await db.incidents.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.get("/incidents", response_model=list[IncidentInDB])
async def list_incidents(
    scope: str = Query(default="unit"),
    status_filter: IncidentStatus | None = Query(default=None, alias="status"),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if scope == "unit":
        if user.get("role") != Role.UNIT_USER.value:
            raise HTTPException(status_code=403, detail="Unit scope requires UNIT_USER")
        query["unitId"] = user["unitId"]
    elif scope == "company":
        if user.get("role") != Role.COMPANY_ADMIN.value:
            raise HTTPException(status_code=403, detail="Company scope requires COMPANY_ADMIN")
        query["companyId"] = user["companyId"]
    else:
        raise HTTPException(status_code=400, detail="Invalid scope")

    if status_filter:
        query["status"] = status_filter.value

    docs = await db.incidents.find(query).sort("reportedAt", -1).to_list(1000)
    return serialize_docs(docs)


@router.patch("/incidents/{incident_id}", response_model=IncidentInDB)
async def update_incident(
    incident_id: str,
    payload: IncidentUpdate,
    user: dict = Depends(require_role(Role.COMPANY_ADMIN)),
):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "status" in update and hasattr(update["status"], "value"):
        update["status"] = update["status"].value
    if update:
        await db.incidents.update_one(
            {"_id": oid(incident_id), "companyId": user["companyId"]},
            {"$set": update},
        )
    doc = await db.incidents.find_one({"_id": oid(incident_id), "companyId": user["companyId"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return serialize_doc(doc)


@router.post("/incidents/{incident_id}/cancel", response_model=IncidentInDB)
async def cancel_dispatch(
    incident_id: str,
    user: dict = Depends(require_role(Role.COMPANY_ADMIN)),
):
    db = get_db()
    incident = await db.incidents.find_one(
        {"_id": oid(incident_id), "companyId": user["companyId"]}
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.get("status") != IncidentStatus.DISPATCHED.value:
        raise HTTPException(status_code=400, detail="Incident is not dispatching")

    dispatch = incident.get("dispatch") or {}
    for tool_code in dispatch.get("allocatedTools", []):
        await db.tools.update_one(
            {"companyId": user["companyId"], "typeCode": tool_code},
            {"$inc": {"availableQty": 1}},
        )
    for lic_code in dispatch.get("allocatedLicenses", []):
        await db.licenses.update_one(
            {"companyId": user["companyId"], "typeCode": lic_code},
            {"$inc": {"inUseNow": -1}},
        )
    if dispatch.get("vehicleAllocated"):
        await db.vehicles.update_one(
            {"companyId": user["companyId"]},
            {"$inc": {"availableQty": 1}},
        )

    await db.incidents.update_one(
        {"_id": oid(incident_id), "companyId": user["companyId"]},
        {"$set": {"status": IncidentStatus.OPEN.value}, "$unset": {"dispatch": ""}},
    )
    updated = await db.incidents.find_one({"_id": oid(incident_id), "companyId": user["companyId"]})
    return serialize_doc(updated)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentInDB)
async def resolve_incident(
    incident_id: str,
    user: dict = Depends(require_role(Role.UNIT_USER)),
):
    db = get_db()
    incident = await db.incidents.find_one(
        {"_id": oid(incident_id), "companyId": user["companyId"], "unitId": user["unitId"]}
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.get("status") not in {IncidentStatus.DISPATCHED.value, IncidentStatus.IN_PROGRESS.value}:
        raise HTTPException(status_code=400, detail="Incident cannot be resolved in current status")

    dispatch = incident.get("dispatch") or {}
    for tool_code in dispatch.get("allocatedTools", []):
        await db.tools.update_one(
            {"companyId": user["companyId"], "typeCode": tool_code},
            {"$inc": {"availableQty": 1}},
        )
    for lic_code in dispatch.get("allocatedLicenses", []):
        await db.licenses.update_one(
            {"companyId": user["companyId"], "typeCode": lic_code},
            {"$inc": {"inUseNow": -1}},
        )
    if dispatch.get("vehicleAllocated"):
        await db.vehicles.update_one(
            {"companyId": user["companyId"]},
            {"$inc": {"availableQty": 1}},
        )

    await db.incidents.update_one(
        {"_id": oid(incident_id), "companyId": user["companyId"]},
        {"$set": {"status": IncidentStatus.RESOLVED.value}},
    )
    updated = await db.incidents.find_one({"_id": oid(incident_id), "companyId": user["companyId"]})
    return serialize_doc(updated)
