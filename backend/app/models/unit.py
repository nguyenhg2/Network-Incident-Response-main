from pydantic import BaseModel, Field
from app.models.common import Location


class UnitBase(BaseModel):
    companyId: str
    name: str
    location: Location
    remoteAccessReady: bool = False
    isSupportStation: bool = False


class UnitCreate(BaseModel):
    name: str
    location: Location
    remoteAccessReady: bool = False
    isSupportStation: bool = False


class UnitUpdate(BaseModel):
    name: str | None = None
    location: Location | None = None
    remoteAccessReady: bool | None = None
    isSupportStation: bool | None = None


class UnitInDB(UnitBase):
    id: str = Field(alias="_id")

    model_config = {"populate_by_name": True}
