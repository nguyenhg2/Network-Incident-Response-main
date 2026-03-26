from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_role
from app.db.mongo import get_db, oid, serialize_doc
from app.models.common import Role
from app.models.company import CompanyInDB, CompanyUpdate

router = APIRouter()


@router.get("/companies/{company_id}", response_model=CompanyInDB)
async def get_company(company_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    if company_id != user.get("companyId"):
        raise HTTPException(status_code=403, detail="Forbidden")
    db = get_db()
    doc = await db.companies.find_one({"_id": oid(company_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Company not found")
    return serialize_doc(doc)


@router.patch("/companies/{company_id}", response_model=CompanyInDB)
async def update_company(
    company_id: str,
    payload: CompanyUpdate,
    user: dict = Depends(require_role(Role.COMPANY_ADMIN)),
):
    if company_id != user.get("companyId"):
        raise HTTPException(status_code=403, detail="Forbidden")
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.companies.update_one({"_id": oid(company_id)}, {"$set": update})
    doc = await db.companies.find_one({"_id": oid(company_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Company not found")
    return serialize_doc(doc)
