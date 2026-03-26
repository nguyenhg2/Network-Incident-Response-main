from datetime import datetime
from pydantic import BaseModel, Field

from app.models.common import Location


class CompanyBase(BaseModel):
    name: str
    createdAt: datetime
    hqLocation: Location | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    hqLocation: Location | None = None


class CompanyInDB(CompanyBase):
    id: str = Field(alias="_id")

    model_config = {"populate_by_name": True}
