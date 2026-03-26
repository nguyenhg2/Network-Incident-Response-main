from pydantic import BaseModel, Field


class ToolBase(BaseModel):
    companyId: str
    name: str
    typeCode: str
    availableQty: int


class ToolCreate(BaseModel):
    name: str
    typeCode: str
    availableQty: int


class ToolUpdate(BaseModel):
    name: str | None = None
    typeCode: str | None = None
    availableQty: int | None = None


class ToolInDB(ToolBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
