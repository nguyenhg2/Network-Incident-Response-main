from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.security import verify_password, create_access_token
from app.db.mongo import get_db, serialize_doc
from app.models.user import LoginRequest, TokenResponse, AuthMeResponse
from app.core.deps import get_current_user

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    db = get_db()
    user = await db.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(payload.password, user.get("passwordHash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user = serialize_doc(user)
    token = create_access_token(
        {
            "sub": user["_id"],
            "role": user["role"],
            "companyId": user["companyId"],
            "unitId": user.get("unitId"),
        },
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(access_token=token, expires_in=settings.access_token_expire_minutes * 60)


@router.get("/me", response_model=AuthMeResponse)
async def me(user: dict = Depends(get_current_user)):
    return user
