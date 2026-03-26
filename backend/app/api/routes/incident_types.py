from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user, require_role
from app.db.mongo import get_db, serialize_docs
from app.db.mongo import oid, serialize_doc
from app.models.common import Role
from app.models.incident_type import IncidentTypeCreate, IncidentTypeUpdate, IncidentTypeInDB

router = APIRouter()


@router.get("", response_model=list[IncidentTypeInDB])
async def list_incident_types(_user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.incident_types.find({}).to_list(1000)
    return serialize_docs(docs)


@router.post("", response_model=IncidentTypeInDB)
async def create_incident_type(payload: IncidentTypeCreate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    doc = payload.model_dump()
    result = await db.incident_types.insert_one(doc)
    created = await db.incident_types.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/{type_id}", response_model=IncidentTypeInDB)
async def update_incident_type(type_id: str, payload: IncidentTypeUpdate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.incident_types.update_one({"_id": oid(type_id)}, {"$set": update})
    doc = await db.incident_types.find_one({"_id": oid(type_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Incident type not found")
    return serialize_doc(doc)


@router.delete("/{type_id}")
async def delete_incident_type(type_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    await db.incident_types.delete_one({"_id": oid(type_id)})
    return {"ok": True}
