from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.init import init_indexes
from app.api.routes import auth, units, incidents, technicians, tools, licenses, vehicles, optimize, incident_types, components, skills, companies, dispatch_runs


app = FastAPI(title="Incident Response Dispatch")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await init_indexes()


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(incident_types.router, prefix="/api/incident-types", tags=["incident-types"])
app.include_router(companies.router, prefix="/api", tags=["companies"])
app.include_router(units.router, prefix="/api", tags=["units"])
app.include_router(incidents.router, prefix="/api", tags=["incidents"])
app.include_router(technicians.router, prefix="/api/technicians", tags=["technicians"])
app.include_router(tools.router, prefix="/api/tools", tags=["tools"])
app.include_router(licenses.router, prefix="/api/licenses", tags=["licenses"])
app.include_router(vehicles.router, prefix="/api/vehicles", tags=["vehicles"])
app.include_router(optimize.router, prefix="/api/optimize", tags=["optimize"])
app.include_router(components.router, prefix="/api/components", tags=["components"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(dispatch_runs.router, prefix="/api/dispatch-runs", tags=["dispatch-runs"])
