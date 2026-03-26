from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user, require_role
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role
from app.models.component import ComponentCreate, ComponentUpdate, ComponentInDB

router = APIRouter()


@router.get("", response_model=list[ComponentInDB])
async def lay_danh_sach_bien_che(
    scope: str = Query(default="company"),
    unitId: str | None = Query(default=None), 
    user: dict = Depends(get_current_user),
):

    db = get_db()

    if user.get("role") == Role.UNIT_USER.value:
        tieu_chi = {"companyId": user["companyId"], "unitId": user["unitId"]}
    else:
        tieu_chi = {"companyId": user["companyId"]}
        if unitId:
            tieu_chi["unitId"] = unitId

    ban_ghi = await db.components.find(tieu_chi).to_list(2000)
    return serialize_docs(ban_ghi)


@router.post("", response_model=ComponentInDB)
async def tao_bien_che(
    payload: ComponentCreate,
    user: dict = Depends(get_current_user),
):
   
   
    db = get_db()

    if user["role"] == Role.UNIT_USER.value:
        if payload.unitId != user["unitId"]:
            raise HTTPException(status_code=403, detail="Bạn chỉ được thêm thiết bị cho đơn vị của mình")
    elif user["role"] == Role.COMPANY_ADMIN.value:
        don_vi = await db.units.find_one({"_id": oid(payload.unitId), "companyId": user["companyId"]})
        if not don_vi:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn vị trong công ty của bạn")
    else:
        raise HTTPException(status_code=403, detail="Không có quyền thực hiện thao tác này")

    ban_ghi = payload.model_dump()
    ban_ghi["companyId"] = user["companyId"]
    ket_qua = await db.components.insert_one(ban_ghi)
    da_tao = await db.components.find_one({"_id": ket_qua.inserted_id})
    return serialize_doc(da_tao)


@router.patch("/{component_id}", response_model=ComponentInDB)
async def cap_nhat_bien_che(
    component_id: str,
    payload: ComponentUpdate,
    user: dict = Depends(get_current_user),
):

    db = get_db()
    cap_nhat = {k: v for k, v in payload.model_dump().items() if v is not None}

    if user["role"] == Role.UNIT_USER.value:
        tieu_chi = {
            "_id": oid(component_id),
            "companyId": user["companyId"],
            "unitId": user["unitId"],
        }
    else:
        tieu_chi = {
            "_id": oid(component_id),
            "companyId": user["companyId"],
        }

    if cap_nhat:
        await db.components.update_one(tieu_chi, {"$set": cap_nhat})

    ban_ghi = await db.components.find_one(tieu_chi)
    if not ban_ghi:
        raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị")
    return serialize_doc(ban_ghi)


@router.delete("/{component_id}")
async def xoa_bien_che(
    component_id: str,
    user: dict = Depends(get_current_user),
):

    db = get_db()

    if user["role"] == Role.UNIT_USER.value:
        tieu_chi = {
            "_id": oid(component_id),
            "companyId": user["companyId"],
            "unitId": user["unitId"],
        }
    else:
        tieu_chi = {
            "_id": oid(component_id),
            "companyId": user["companyId"],
        }

    await db.components.delete_one(tieu_chi)
    return {"ok": True}