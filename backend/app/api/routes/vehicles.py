from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role
from app.models.vehicle import VehicleCreate, VehicleUpdate, VehicleInDB

router = APIRouter()


@router.get("", response_model=list[VehicleInDB])
async def list_vehicles(user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    docs = await db.vehicles.find({"companyId": user["companyId"]}).to_list(1000)
    return serialize_docs(docs)


@router.post("", response_model=VehicleInDB)
async def create_vehicle(payload: VehicleCreate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    doc = payload.model_dump()
    doc["companyId"] = user["companyId"]
    result = await db.vehicles.insert_one(doc)
    created = await db.vehicles.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/{vehicle_id}", response_model=VehicleInDB)
async def update_vehicle(vehicle_id: str, payload: VehicleUpdate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.vehicles.update_one({"_id": oid(vehicle_id), "companyId": user["companyId"]}, {"$set": update})
    doc = await db.vehicles.find_one({"_id": oid(vehicle_id), "companyId": user["companyId"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return serialize_doc(doc)


@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    await db.vehicles.delete_one({"_id": oid(vehicle_id), "companyId": user["companyId"]})
    return {"ok": True}
