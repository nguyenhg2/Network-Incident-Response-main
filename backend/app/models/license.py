from pydantic import BaseModel, Field


class LicenseBase(BaseModel):
    companyId: str
    name: str
    typeCode: str
    capTotal: int
    inUseNow: int = 0


class LicenseCreate(BaseModel):
    name: str
    typeCode: str
    capTotal: int
    inUseNow: int = 0


class LicenseUpdate(BaseModel):
    name: str | None = None
    typeCode: str | None = None
    capTotal: int | None = None
    inUseNow: int | None = None


class LicenseInDB(LicenseBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
