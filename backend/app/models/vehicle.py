from pydantic import BaseModel, Field


class VehicleBase(BaseModel):
    companyId: str
    availableQty: int


class VehicleCreate(BaseModel):
    availableQty: int


class VehicleUpdate(BaseModel):
    availableQty: int | None = None


class VehicleInDB(VehicleBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
