from pydantic import BaseModel, Field


class SkillBase(BaseModel):
    companyId: str
    name: str


class SkillCreate(BaseModel):
    name: str


class SkillUpdate(BaseModel):
    name: str


class SkillInDB(SkillBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
