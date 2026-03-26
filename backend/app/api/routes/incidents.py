from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import require_role, get_current_user
from app.db.mongo import get_db, oid, serialize_doc, serialize_docs
from app.models.common import Role, IncidentStatus
from app.models.incident import IncidentCreate, IncidentInDB, IncidentUpdate

router = APIRouter()


@router.post("/incidents", response_model=IncidentInDB)
async def tao_su_co(
    payload: IncidentCreate,
    user: dict = Depends(get_current_user), 
):
    
    db = get_db()

    if user["role"] == Role.UNIT_USER.value:
        if payload.unitId != user.get("unitId"):
            raise HTTPException(status_code=403, detail="Bạn chỉ được báo cáo sự cố cho đơn vị của mình")
    elif user["role"] == Role.COMPANY_ADMIN.value:
        don_vi = await db.units.find_one({"_id": oid(payload.unitId), "companyId": user["companyId"]})
        if not don_vi:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn vị trong công ty của bạn")
    else:
        raise HTTPException(status_code=403, detail="Không có quyền thực hiện thao tác này")

    loai_su_co = await db.incident_types.find_one({"code": payload.typeCode})
    if not loai_su_co:
        raise HTTPException(status_code=404, detail="Không tìm thấy loại sự cố")

    don_vi = await db.units.find_one({"_id": oid(payload.unitId)})
    if not don_vi:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn vị")

    if payload.componentId:
        thiet_bi = await db.components.find_one(
            {"_id": oid(payload.componentId), "unitId": payload.unitId}
        )
        if not thiet_bi:
            raise HTTPException(status_code=404, detail="Không tìm thấy thiết bị thuộc đơn vị này")

    do_uu_tien = loai_su_co.get("defaultPriority", 1)
    thoi_gian_setup_remote = loai_su_co.get("defaultSetupRemote", 0.5)

    che_do_kha_thi = {
        "R": bool(don_vi.get("remoteAccessReady")) and bool(loai_su_co.get("defaultFeasRemote", True)),
        "O": bool(loai_su_co.get("defaultFeasOnsite", True)),
    }

    ban_ghi = {
        "companyId": user["companyId"],
        "unitId": payload.unitId,
        "componentId": payload.componentId,
        "typeCode": payload.typeCode,
        "priority": do_uu_tien,
        "status": IncidentStatus.OPEN.value,
        "reportedAt": datetime.now(timezone.utc),
        "modeFeas": che_do_kha_thi,
        "setupRemote": thoi_gian_setup_remote,
        "requirements": loai_su_co.get("requirements", {}),
        "notes": payload.notes,
    }

    ket_qua = await db.incidents.insert_one(ban_ghi)
    da_tao = await db.incidents.find_one({"_id": ket_qua.inserted_id})
    return serialize_doc(da_tao)


@router.get("/incidents", response_model=list[IncidentInDB])
async def lay_danh_sach_su_co(
    scope: str = Query(default="unit"),
    status_filter: IncidentStatus | None = Query(default=None, alias="status"),
    unitId: str | None = Query(default=None),  
    user: dict = Depends(get_current_user),
):
 
    db = get_db()
    tieu_chi = {}

    if scope == "unit":
        if user.get("role") == Role.COMPANY_ADMIN.value:
            if unitId:
                tieu_chi["unitId"] = unitId
                tieu_chi["companyId"] = user["companyId"]
            else:
                raise HTTPException(status_code=400, detail="Admin cần truyền ?unitId= khi dùng scope=unit")
        elif user.get("role") == Role.UNIT_USER.value:
            tieu_chi["unitId"] = user["unitId"]
        else:
            raise HTTPException(status_code=403, detail="Không có quyền xem sự cố theo đơn vị")

    elif scope == "company":
        if user.get("role") != Role.COMPANY_ADMIN.value:
            raise HTTPException(status_code=403, detail="Chỉ admin công ty mới được xem toàn bộ sự cố")
        tieu_chi["companyId"] = user["companyId"]
    else:
        raise HTTPException(status_code=400, detail="Giá trị scope không hợp lệ (unit hoặc company)")

    if status_filter:
        tieu_chi["status"] = status_filter.value

    ban_ghi = await db.incidents.find(tieu_chi).sort("reportedAt", -1).to_list(1000)
    return serialize_docs(ban_ghi)


@router.patch("/incidents/{incident_id}", response_model=IncidentInDB)
async def cap_nhat_su_co(
    incident_id: str,
    payload: IncidentUpdate,
    user: dict = Depends(require_role(Role.COMPANY_ADMIN)),
):
    
    db = get_db()
    cap_nhat = {k: v for k, v in payload.model_dump().items() if v is not None}

    if "status" in cap_nhat and hasattr(cap_nhat["status"], "value"):
        cap_nhat["status"] = cap_nhat["status"].value

    if cap_nhat:
        await db.incidents.update_one(
            {"_id": oid(incident_id), "companyId": user["companyId"]},
            {"$set": cap_nhat},
        )

    ban_ghi = await db.incidents.find_one({"_id": oid(incident_id), "companyId": user["companyId"]})
    if not ban_ghi:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự cố")
    return serialize_doc(ban_ghi)


@router.post("/incidents/{incident_id}/cancel", response_model=IncidentInDB)
async def huy_dieu_phoi(
    incident_id: str,
    user: dict = Depends(require_role(Role.COMPANY_ADMIN)),
):

    db = get_db()
    su_co = await db.incidents.find_one(
        {"_id": oid(incident_id), "companyId": user["companyId"]}
    )
    if not su_co:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự cố")
    if su_co.get("status") != IncidentStatus.DISPATCHED.value:
        raise HTTPException(status_code=400, detail="Chỉ có thể huỷ sự cố đang ở trạng thái Đã điều phối")

    dieu_phoi = su_co.get("dispatch") or {}

    for ma_cong_cu in dieu_phoi.get("allocatedTools", []):
        await db.tools.update_one(
            {"companyId": user["companyId"], "typeCode": ma_cong_cu},
            {"$inc": {"availableQty": 1}},
        )

    for ma_phan_mem in dieu_phoi.get("allocatedLicenses", []):
        await db.licenses.update_one(
            {"companyId": user["companyId"], "typeCode": ma_phan_mem},
            {"$inc": {"inUseNow": -1}},
        )

    if dieu_phoi.get("vehicleAllocated"):
        await db.vehicles.update_one(
            {"companyId": user["companyId"]},
            {"$inc": {"availableQty": 1}},
        )

    await db.incidents.update_one(
        {"_id": oid(incident_id), "companyId": user["companyId"]},
        {"$set": {"status": IncidentStatus.OPEN.value}, "$unset": {"dispatch": ""}},
    )
    da_cap_nhat = await db.incidents.find_one({"_id": oid(incident_id), "companyId": user["companyId"]})
    return serialize_doc(da_cap_nhat)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentInDB)
async def xac_nhan_hoan_thanh(
    incident_id: str,
    user: dict = Depends(get_current_user), 

    db = get_db()

    if user["role"] == Role.UNIT_USER.value:
        tieu_chi = {
            "_id": oid(incident_id),
            "companyId": user["companyId"],
            "unitId": user["unitId"],  
        }
    else:
        tieu_chi = {
            "_id": oid(incident_id),
            "companyId": user["companyId"],
        }

    su_co = await db.incidents.find_one(tieu_chi)
    if not su_co:
        raise HTTPException(status_code=404, detail="Không tìm thấy sự cố")

    if su_co.get("status") not in {IncidentStatus.DISPATCHED.value, IncidentStatus.IN_PROGRESS.value}:
        raise HTTPException(
            status_code=400,
            detail="Chỉ có thể hoàn thành sự cố đang ở trạng thái Đã điều phối hoặc Đang xử lý"
        )

    dieu_phoi = su_co.get("dispatch") or {}

    for ma_cong_cu in dieu_phoi.get("allocatedTools", []):
        await db.tools.update_one(
            {"companyId": user["companyId"], "typeCode": ma_cong_cu},
            {"$inc": {"availableQty": 1}},
        )

    for ma_phan_mem in dieu_phoi.get("allocatedLicenses", []):
        await db.licenses.update_one(
            {"companyId": user["companyId"], "typeCode": ma_phan_mem},
            {"$inc": {"inUseNow": -1}},
        )

    if dieu_phoi.get("vehicleAllocated"):
        await db.vehicles.update_one(
            {"companyId": user["companyId"]},
            {"$inc": {"availableQty": 1}},
        )

    await db.incidents.update_one(
        {"_id": oid(incident_id), "companyId": user["companyId"]},
        {"$set": {"status": IncidentStatus.RESOLVED.value}},
    )
    da_cap_nhat = await db.incidents.find_one({"_id": oid(incident_id), "companyId": user["companyId"]})
    return serialize_doc(da_cap_nhat)