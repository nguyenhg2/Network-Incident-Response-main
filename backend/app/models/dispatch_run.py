from datetime import datetime
from pydantic import BaseModel, Field


class DispatchAssignment(BaseModel):
    incidentId: str
    technicianId: str
    mode: str  # "R" or "O"
    allocatedTools: list[str]
    allocatedLicenses: list[str]
    vehicleAllocated: bool
    timeToRestoreEstimateHours: float


class DispatchObjectives(BaseModel):
    Z1: int
    Z2: int
    Z3: int


class DispatchResult(BaseModel):
    assignments: list[DispatchAssignment]
    objectives: DispatchObjectives


class DispatchSnapshot(BaseModel):
    tools: dict
    licenses: dict
    vehicles: int


class DispatchRunBase(BaseModel):
    companyId: str
    createdAt: datetime
    incidentIds: list[str]
    result: DispatchResult
    snapshot: DispatchSnapshot


class DispatchRunInDB(DispatchRunBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
