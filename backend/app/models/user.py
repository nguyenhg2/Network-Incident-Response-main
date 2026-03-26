from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.models.common import Role


class UserBase(BaseModel):
    email: str
    role: Role
    companyId: str
    unitId: Optional[str] = None


class UserCreate(BaseModel):
    email: str
    password: str
    role: Role
    companyId: str
    unitId: Optional[str] = None


class UserInDB(UserBase):
    id: str = Field(alias="_id")
    passwordHash: str

    model_config = {
        "populate_by_name": True,
    }


class UserPublic(UserBase):
    id: str = Field(alias="_id")

    model_config = {
        "populate_by_name": True,
    }


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthMeResponse(UserPublic):
    pass
