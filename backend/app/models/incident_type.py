from pydantic import BaseModel, Field
from app.models.common import Requirements


class IncidentTypeBase(BaseModel):
    code: str
    name: str
    defaultPriority: int
    defaultSetupRemote: float
    defaultFeasRemote: bool
    defaultFeasOnsite: bool
    requirements: Requirements


class IncidentTypeCreate(IncidentTypeBase):
    pass


class IncidentTypeUpdate(BaseModel):
    name: str | None = None
    defaultPriority: int | None = None
    defaultSetupRemote: float | None = None
    defaultFeasRemote: bool | None = None
    defaultFeasOnsite: bool | None = None
    requirements: Requirements | None = None


class IncidentTypeInDB(IncidentTypeBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
