from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_role
from app.db.mongo import get_db, oid
from app.models.common import Role
from app.optimization.dispatch_now import build_instance, solve, build_unassigned_reasons

router = APIRouter()


class OptimizeRequest(BaseModel):
    incidentIds: list[str] | None = None
    maxIncidents: int | None = None


@router.post("/dispatch-now")
async def dispatch_now(payload: OptimizeRequest, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()

    instance = await build_instance(db, user["companyId"], payload.incidentIds, payload.maxIncidents)
    result = solve(instance)
    unassigned = build_unassigned_reasons(instance, result.assignments)

    run_doc = {
        "companyId": user["companyId"],
        "createdAt": datetime.now(timezone.utc),
        "incidentIds": [str(i["_id"]) for i in instance.incidents],
        "result": {
            "assignments": result.assignments,
            "objectives": result.objectives,
        },
        "snapshot": {
            "tools": instance.tools,
            "licenses": instance.licenses,
            "vehicles": instance.vehicles,
        },
    }
    run_id = (await db.dispatch_runs.insert_one(run_doc)).inserted_id

    # Apply dispatch updates
    assigned_ids = []
    for assignment in result.assignments:
        incident_id = assignment["incidentId"]
        assigned_ids.append(incident_id)
        # Reserve resources
        for tool_code in assignment.get("allocatedTools", []):
            await db.tools.update_one(
                {"companyId": user["companyId"], "typeCode": tool_code, "availableQty": {"$gt": 0}},
                {"$inc": {"availableQty": -1}},
            )
        for lic_code in assignment.get("allocatedLicenses", []):
            await db.licenses.update_one(
                {"companyId": user["companyId"], "typeCode": lic_code},
                {"$inc": {"inUseNow": 1}},
            )
        if assignment.get("vehicleAllocated"):
            await db.vehicles.update_one(
                {"companyId": user["companyId"], "availableQty": {"$gt": 0}},
                {"$inc": {"availableQty": -1}},
            )
        await db.incidents.update_one(
            {"_id": oid(incident_id), "companyId": user["companyId"]},
            {
                "$set": {
                    "status": "DISPATCHED",
                    "dispatch": {
                        "dispatchRunId": str(run_id),
                        "assignedTechId": assignment["technicianId"],
                        "mode": assignment["mode"],
                        "assignedAt": datetime.now(timezone.utc).isoformat(),
                        "allocatedTools": assignment["allocatedTools"],
                        "allocatedLicenses": assignment["allocatedLicenses"],
                        "vehicleAllocated": assignment["vehicleAllocated"],
                        "timeToRestoreEstimateHours": assignment["timeToRestoreEstimateHours"],
                    },
                }
            },
        )

    return {
        "dispatchRunId": str(run_id),
        "objectives": result.objectives,
        "assignments": result.assignments,
        "unassigned": unassigned,
        "updatedIncidentIds": assigned_ids,
    }
