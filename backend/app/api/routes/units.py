from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.unit import UnitCreate, UnitUpdate, UnitInDB
from app.models.common import Role

router = APIRouter()


def _ensure_company(user: dict, company_id: str) -> None:
    if user.get("companyId") != company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company mismatch")


async def _ensure_single_station(db, company_id: str, unit_id: str | None = None) -> None:
    existing = await db.units.find_one({"companyId": company_id, "isSupportStation": True})
    if existing and (unit_id is None or str(existing["_id"]) != unit_id):
        raise HTTPException(status_code=400, detail="Support station already exists for this company")


@router.get("/companies/{company_id}/units", response_model=list[UnitInDB])
async def list_units(company_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    _ensure_company(user, company_id)
    db = get_db()
    docs = await db.units.find({"companyId": company_id}).to_list(1000)
    return serialize_docs(docs)


@router.post("/companies/{company_id}/units", response_model=UnitInDB)
async def create_unit(company_id: str, payload: UnitCreate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    _ensure_company(user, company_id)
    db = get_db()
    if payload.isSupportStation:
        await _ensure_single_station(db, company_id)
    doc = payload.model_dump()
    doc["companyId"] = company_id
    result = await db.units.insert_one(doc)
    created = await db.units.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/companies/{company_id}/units/{unit_id}", response_model=UnitInDB)
async def update_unit(company_id: str, unit_id: str, payload: UnitUpdate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    _ensure_company(user, company_id)
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update.get("isSupportStation"):
        await _ensure_single_station(db, company_id, unit_id=unit_id)
    if update:
        await db.units.update_one({"_id": oid(unit_id), "companyId": company_id}, {"$set": update})
    unit = await db.units.find_one({"_id": oid(unit_id), "companyId": company_id})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return serialize_doc(unit)


@router.delete("/companies/{company_id}/units/{unit_id}")
async def delete_unit(company_id: str, unit_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    _ensure_company(user, company_id)
    db = get_db()
    await db.units.delete_one({"_id": oid(unit_id), "companyId": company_id})
    return {"ok": True}


@router.get("/units/me", response_model=UnitInDB)
async def get_my_unit(user: dict = Depends(require_role(Role.UNIT_USER))):
    db = get_db()
    unit = await db.units.find_one({"_id": oid(user["unitId"]), "companyId": user["companyId"]})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return serialize_doc(unit)




@router.get("/companies/{company_id}/units/map")
async def units_map(company_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    _ensure_company(user, company_id)
    db = get_db()
    units = await db.units.find({"companyId": company_id}).to_list(1000)
    unit_ids = [u["_id"] for u in units]
    counts = {}
    if unit_ids:
        pipeline = [
            {"$match": {"unitId": {"$in": [str(uid) for uid in unit_ids]}, "status": {"$in": ["OPEN", "DISPATCHED", "IN_PROGRESS"]}}},
            {"$group": {"_id": "$unitId", "count": {"$sum": 1}}},
        ]
        for row in await db.incidents.aggregate(pipeline).to_list(1000):
            counts[row["_id"]] = row["count"]

    result = []
    for unit in units:
        unit = serialize_doc(unit)
        unit["activeIncidents"] = counts.get(unit["_id"], 0)
        result.append(unit)
    return result
