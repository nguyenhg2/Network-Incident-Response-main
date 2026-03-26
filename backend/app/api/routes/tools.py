from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role
from app.models.tool import ToolCreate, ToolUpdate, ToolInDB

router = APIRouter()


@router.get("", response_model=list[ToolInDB])
async def list_tools(user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    docs = await db.tools.find({"companyId": user["companyId"]}).to_list(1000)
    return serialize_docs(docs)


@router.post("", response_model=ToolInDB)
async def create_tool(payload: ToolCreate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    doc = payload.model_dump()
    doc["companyId"] = user["companyId"]
    result = await db.tools.insert_one(doc)
    created = await db.tools.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/{tool_id}", response_model=ToolInDB)
async def update_tool(tool_id: str, payload: ToolUpdate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.tools.update_one({"_id": oid(tool_id), "companyId": user["companyId"]}, {"$set": update})
    doc = await db.tools.find_one({"_id": oid(tool_id), "companyId": user["companyId"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    return serialize_doc(doc)


@router.delete("/{tool_id}")
async def delete_tool(tool_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    await db.tools.delete_one({"_id": oid(tool_id), "companyId": user["companyId"]})
    return {"ok": True}
