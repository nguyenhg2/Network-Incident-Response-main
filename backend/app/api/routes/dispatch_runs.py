from fastapi import APIRouter, Depends

from app.core.deps import require_role
from app.db.mongo import get_db, serialize_docs
from app.models.common import Role
from app.models.dispatch_run import DispatchRunInDB

router = APIRouter()


@router.get("", response_model=list[DispatchRunInDB])
async def list_dispatch_runs(user: dict = Depends(require_role(Role.COMPANY_ADMIN))):
    db = get_db()
    docs = await db.dispatch_runs.find({"companyId": user["companyId"]}).sort("createdAt", -1).to_list(200)
    return serialize_docs(docs)
