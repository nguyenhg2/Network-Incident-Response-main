from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role
from app.models.technician import TechnicianCreate, TechnicianUpdate, TechnicianInDB

router = APIRouter()


async def _get_station_location(db, company_id: str) -> dict:
    station = await db.units.find_one({"companyId": company_id, "isSupportStation": True})
    if not station or not station.get("location"):
        raise HTTPException(status_code=400, detail="Support station is not configured")
    return station["location"]


@router.get("", response_model=list[TechnicianInDB])
async def list_technicians(user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    docs = await db.technicians.find({"companyId": user["companyId"]}).to_list(1000)
    return serialize_docs(docs)


@router.post("", response_model=TechnicianInDB)
async def create_technician(payload: TechnicianCreate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    station_location = await _get_station_location(db, user["companyId"])
    doc = payload.model_dump()
    doc["companyId"] = user["companyId"]
    doc["homeLocation"] = station_location
    result = await db.technicians.insert_one(doc)
    created = await db.technicians.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/{tech_id}", response_model=TechnicianInDB)
async def update_technician(tech_id: str, payload: TechnicianUpdate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    station_location = await _get_station_location(db, user["companyId"])
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["homeLocation"] = station_location
    if update:
        await db.technicians.update_one({"_id": oid(tech_id), "companyId": user["companyId"]}, {"$set": update})
    doc = await db.technicians.find_one({"_id": oid(tech_id), "companyId": user["companyId"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Technician not found")
    return serialize_doc(doc)


@router.delete("/{tech_id}")
async def delete_technician(tech_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    await db.technicians.delete_one({"_id": oid(tech_id), "companyId": user["companyId"]})
    return {"ok": True}
