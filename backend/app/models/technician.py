from pydantic import BaseModel, Field
from app.models.common import Location


class DurationMatrixEntry(BaseModel):
    typeCode: str
    mode: str  # "R" or "O"
    durationHours: float


class TechnicianBase(BaseModel):
    companyId: str
    name: str
    skills: list[str]
    availableNow: bool = True
    homeLocation: Location
    dMatrix: list[DurationMatrixEntry]


class TechnicianCreate(BaseModel):
    name: str
    skills: list[str]
    availableNow: bool = True
    homeLocation: Location
    dMatrix: list[DurationMatrixEntry]


class TechnicianUpdate(BaseModel):
    name: str | None = None
    skills: list[str] | None = None
    availableNow: bool | None = None
    homeLocation: Location | None = None
    dMatrix: list[DurationMatrixEntry] | None = None


class TechnicianInDB(TechnicianBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
