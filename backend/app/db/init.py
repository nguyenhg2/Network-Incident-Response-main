from app.db.mongo import get_db


async def init_indexes() -> None:
    db = get_db()
    await db.units.create_index([("companyId", 1)])
    await db.units.create_index(
        [("companyId", 1), ("isSupportStation", 1)],
        unique=True,
        partialFilterExpression={"isSupportStation": True},
    )
    await db.users.create_index([("email", 1)], unique=True)
    await db.incidents.create_index([("companyId", 1), ("status", 1)])
    await db.incidents.create_index([("unitId", 1), ("status", 1)])
    await db.components.create_index([("companyId", 1)])
    await db.components.create_index([("unitId", 1)])
    await db.technicians.create_index([("companyId", 1), ("availableNow", 1)])
    await db.skills.create_index([("companyId", 1)])
    await db.tools.create_index([("companyId", 1)])
    await db.licenses.create_index([("companyId", 1)])
    await db.vehicles.create_index([("companyId", 1)])
    await db.incident_types.create_index([("code", 1)], unique=True)
