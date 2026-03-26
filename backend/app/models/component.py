from pydantic import BaseModel, Field


class NetworkConfig(BaseModel):
    subnet: str | None = None
    gateway: str | None = None
    vlan: str | None = None


class ComponentBase(BaseModel):
    companyId: str
    unitId: str
    name: str
    type: str
    status: str = "ACTIVE"
    location: str | None = None
    serial: str | None = None
    ipAddress: str | None = None
    macAddress: str | None = None
    vendor: str | None = None
    model: str | None = None
    os: str | None = None
    cpu: str | None = None
    ramGB: int | None = None
    storageGB: int | None = None
    firmware: str | None = None
    networkConfig: NetworkConfig | None = None
    notes: str | None = None


class ComponentCreate(BaseModel):
    unitId: str
    name: str
    type: str
    status: str = "ACTIVE"
    location: str | None = None
    serial: str | None = None
    ipAddress: str | None = None
    macAddress: str | None = None
    vendor: str | None = None
    model: str | None = None
    os: str | None = None
    cpu: str | None = None
    ramGB: int | None = None
    storageGB: int | None = None
    firmware: str | None = None
    networkConfig: NetworkConfig | None = None
    notes: str | None = None


class ComponentUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    status: str | None = None
    location: str | None = None
    serial: str | None = None
    ipAddress: str | None = None
    macAddress: str | None = None
    vendor: str | None = None
    model: str | None = None
    os: str | None = None
    cpu: str | None = None
    ramGB: int | None = None
    storageGB: int | None = None
    firmware: str | None = None
    networkConfig: NetworkConfig | None = None
    notes: str | None = None


class ComponentInDB(ComponentBase):
    id: str = Field(alias="_id")
    model_config = {"populate_by_name": True}
