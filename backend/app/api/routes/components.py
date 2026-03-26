from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user, require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role
from app.models.component import ComponentCreate, ComponentUpdate, ComponentInDB

router = APIRouter()


@router.get("", response_model=list[ComponentInDB])
async def list_components(
    scope: str = Query(default="company"),
    user: dict = Depends(get_current_user),
):
    db = get_db()
    if user.get("role") == Role.UNIT_USER.value:
        query = {"companyId": user["companyId"], "unitId": user["unitId"]}
    else:
        if scope not in ("company", "unit"):
            raise HTTPException(status_code=400, detail="Invalid scope")
        query = {"companyId": user["companyId"]}
    docs = await db.components.find(query).to_list(2000)
    return serialize_docs(docs)


@router.post("", response_model=ComponentInDB)
async def create_component(payload: ComponentCreate, user: dict = Depends(require_role(Role.UNIT_USER))):
    db = get_db()
    if payload.unitId != user["unitId"]:
        raise HTTPException(status_code=403, detail="Unit mismatch")
    unit = await db.units.find_one({"_id": oid(payload.unitId), "companyId": user["companyId"]})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    doc = payload.model_dump()
    doc["companyId"] = user["companyId"]
    result = await db.components.insert_one(doc)
    created = await db.components.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/{component_id}", response_model=ComponentInDB)
async def update_component(component_id: str, payload: ComponentUpdate, user: dict = Depends(require_role(Role.UNIT_USER))):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.components.update_one(
            {"_id": oid(component_id), "companyId": user["companyId"], "unitId": user["unitId"]},
            {"$set": update},
        )
    doc = await db.components.find_one(
        {"_id": oid(component_id), "companyId": user["companyId"], "unitId": user["unitId"]}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Component not found")
    return serialize_doc(doc)


@router.delete("/{component_id}")
async def delete_component(component_id: str, user: dict = Depends(require_role(Role.UNIT_USER))):
    db = get_db()
    await db.components.delete_one(
        {"_id": oid(component_id), "companyId": user["companyId"], "unitId": user["unitId"]}
    )
    return {"ok": True}
