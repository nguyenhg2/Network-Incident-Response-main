from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role
from app.models.skill import SkillCreate, SkillUpdate, SkillInDB

router = APIRouter()


@router.get("", response_model=list[SkillInDB])
async def list_skills(user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    docs = await db.skills.find({"companyId": user["companyId"]}).to_list(1000)
    return serialize_docs(docs)


@router.post("", response_model=SkillInDB)
async def create_skill(payload: SkillCreate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    doc = payload.model_dump()
    doc["companyId"] = user["companyId"]
    result = await db.skills.insert_one(doc)
    created = await db.skills.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/{skill_id}", response_model=SkillInDB)
async def update_skill(skill_id: str, payload: SkillUpdate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    await db.skills.update_one(
        {"_id": oid(skill_id), "companyId": user["companyId"]},
        {"$set": payload.model_dump()},
    )
    doc = await db.skills.find_one({"_id": oid(skill_id), "companyId": user["companyId"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Skill not found")
    return serialize_doc(doc)


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    await db.skills.delete_one({"_id": oid(skill_id), "companyId": user["companyId"]})
    return {"ok": True}
