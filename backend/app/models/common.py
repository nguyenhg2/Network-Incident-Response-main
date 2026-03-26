from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class Role(str, Enum):
    COMPANY_ADMIN = "COMPANY_ADMIN"
    UNIT_USER = "UNIT_USER"


class IncidentStatus(str, Enum):
    OPEN = "OPEN"
    DISPATCHED = "DISPATCHED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"


class Mode(str, Enum):
    REMOTE = "R"
    ONSITE = "O"


class Location(BaseModel):
    lat: float
    lng: float
    address: str | None = None


class ModeFeas(BaseModel):
    R: bool
    O: bool


class RequirementsByMode(BaseModel):
    R: list[str] = Field(default_factory=list)
    O: list[str] = Field(default_factory=list)


class Requirements(BaseModel):
    requiredSkills: list[str] = Field(default_factory=list)
    requiredToolsByMode: RequirementsByMode = Field(default_factory=RequirementsByMode)
    requiredLicensesByMode: RequirementsByMode = Field(default_factory=RequirementsByMode)
    requiresVehicleIfOnsite: bool = False


class DispatchInfo(BaseModel):
    dispatchRunId: str
    assignedTechId: str
    mode: Mode
    assignedAt: str
    allocatedTools: list[str] = Field(default_factory=list)
    allocatedLicenses: list[str] = Field(default_factory=list)
    vehicleAllocated: bool = False
    timeToRestoreEstimateHours: float


class PyObjectId(str):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @classmethod
    def __get_pydantic_core_schema__(cls, _source, handler):
        return handler(str)
