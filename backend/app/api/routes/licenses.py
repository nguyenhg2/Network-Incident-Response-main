from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role
from app.models.license import LicenseCreate, LicenseUpdate, LicenseInDB

router = APIRouter()


@router.get("", response_model=list[LicenseInDB])
async def list_licenses(user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    docs = await db.licenses.find({"companyId": user["companyId"]}).to_list(1000)
    return serialize_docs(docs)


@router.post("", response_model=LicenseInDB)
async def create_license(payload: LicenseCreate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    doc = payload.model_dump()
    doc["companyId"] = user["companyId"]
    result = await db.licenses.insert_one(doc)
    created = await db.licenses.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.patch("/{license_id}", response_model=LicenseInDB)
async def update_license(license_id: str, payload: LicenseUpdate, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.licenses.update_one({"_id": oid(license_id), "companyId": user["companyId"]}, {"$set": update})
    doc = await db.licenses.find_one({"_id": oid(license_id), "companyId": user["companyId"]})
    if not doc:
        raise HTTPException(status_code=404, detail="License not found")
    return serialize_doc(doc)


@router.delete("/{license_id}")
async def delete_license(license_id: str, user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    await db.licenses.delete_one({"_id": oid(license_id), "companyId": user["companyId"]})
    return {"ok": True}
