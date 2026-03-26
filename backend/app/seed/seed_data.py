import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.security import get_password_hash


async def seed() -> None:
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_db]

    # Clear collections
    for name in [
        "companies",
        "units",
        "users",
        "incident_types",
        "incidents",
        "components",
        "skills",
        "technicians",
        "tools",
        "licenses",
        "vehicles",
        "dispatch_runs",
    ]:
        await db[name].delete_many({})

    company = {
        "name": "Acme Logistics",
        "createdAt": datetime.now(timezone.utc),
        "hqLocation": {"lat": 10.7769, "lng": 106.7009, "address": "HCMC (HQ)"},
    }
    company_id = (await db.companies.insert_one(company)).inserted_id

    units = [
        {
            "companyId": str(company_id),
            "name": "Unit A - HCMC",
            "location": {"lat": 10.7769, "lng": 106.7009, "address": "HCMC"},
            "remoteAccessReady": True,
            "isSupportStation": True,
        },
        {
            "companyId": str(company_id),
            "name": "Unit B - Hanoi",
            "location": {"lat": 21.0285, "lng": 105.8542, "address": "Hanoi"},
            "remoteAccessReady": True,
            "isSupportStation": False,
        },
        {
            "companyId": str(company_id),
            "name": "Unit C - Danang",
            "location": {"lat": 16.0544, "lng": 108.2022, "address": "Danang"},
            "remoteAccessReady": False,
            "isSupportStation": False,
        },
    ]
    unit_ids = (await db.units.insert_many(units)).inserted_ids

    admin_user = {
        "email": "admin@acme.local",
        "passwordHash": get_password_hash("admin123"),
        "role": "COMPANY_ADMIN",
        "companyId": str(company_id),
        "unitId": None,
    }
    await db.users.insert_one(admin_user)

    unit_users = [
        {
            "email": "unit1@acme.local",
            "passwordHash": get_password_hash("unit123"),
            "role": "UNIT_USER",
            "companyId": str(company_id),
            "unitId": str(unit_ids[0]),
        },
        {
            "email": "unit2@acme.local",
            "passwordHash": get_password_hash("unit123"),
            "role": "UNIT_USER",
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
        },
        {
            "email": "unit3@acme.local",
            "passwordHash": get_password_hash("unit123"),
            "role": "UNIT_USER",
            "companyId": str(company_id),
            "unitId": str(unit_ids[2]),
        },
    ]
    await db.users.insert_many(unit_users)

    incident_types = [
        {
            "code": "SERVER_NO_BOOT",
            "name": "Server No Boot",
            "defaultPriority": 5,
            "defaultSetupRemote": 0.5,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["server"],
                "requiredToolsByMode": {"R": ["BOOT_DISK"], "O": ["BOOT_DISK"]},
                "requiredLicensesByMode": {"R": [], "O": []},
                "requiresVehicleIfOnsite": True,
            },
        },
        {
            "code": "WEB_DOWN",
            "name": "Website Down",
            "defaultPriority": 4,
            "defaultSetupRemote": 0.25,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["web"],
                "requiredToolsByMode": {"R": [], "O": ["SWITCH_TOOL"]},
                "requiredLicensesByMode": {"R": ["NETDIAG_SUITE"], "O": ["NETDIAG_SUITE"]},
                "requiresVehicleIfOnsite": False,
            },
        },
        {
            "code": "MALWARE_SPREAD",
            "name": "Malware Spread",
            "defaultPriority": 5,
            "defaultSetupRemote": 0.75,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["malware"],
                "requiredToolsByMode": {"R": ["FORENSIC_KIT"], "O": ["FORENSIC_KIT"]},
                "requiredLicensesByMode": {"R": ["SECURE_SCAN"], "O": ["SECURE_SCAN"]},
                "requiresVehicleIfOnsite": True,
            },
        },
        {
            "code": "ROUTING_OUT",
            "name": "Routing Outage",
            "defaultPriority": 3,
            "defaultSetupRemote": 0.4,
            "defaultFeasRemote": False,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["network"],
                "requiredToolsByMode": {"R": [], "O": ["ROUTER_TOOL"]},
                "requiredLicensesByMode": {"R": [], "O": []},
                "requiresVehicleIfOnsite": True,
            },
        },
    ]
    await db.incident_types.insert_many(incident_types)

    technicians = [
        {
            "companyId": str(company_id),
            "name": "Nguyen Van A",
            "skills": ["server", "malware", "network"],
            "availableNow": True,
            "homeLocation": {"lat": 10.7769, "lng": 106.7009, "address": "HCMC"},
            "dMatrix": [
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 2.0},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 3.0},
                {"typeCode": "MALWARE_SPREAD", "mode": "R", "durationHours": 4.0},
                {"typeCode": "MALWARE_SPREAD", "mode": "O", "durationHours": 5.0},
                {"typeCode": "ROUTING_OUT", "mode": "O", "durationHours": 2.5},
                {"typeCode": "ROUTING_OUT", "mode": "R", "durationHours": 2.0},
            ],
        },
        {
            "companyId": str(company_id),
            "name": "Tran Thi B",
            "skills": ["web", "network"],
            "availableNow": True,
            "homeLocation": {"lat": 10.7769, "lng": 106.7009, "address": "HCMC"},
            "dMatrix": [
                {"typeCode": "WEB_DOWN", "mode": "R", "durationHours": 1.0},
                {"typeCode": "WEB_DOWN", "mode": "O", "durationHours": 2.0},
                {"typeCode": "ROUTING_OUT", "mode": "O", "durationHours": 2.2},
                {"typeCode": "ROUTING_OUT", "mode": "R", "durationHours": 1.8},
            ],
        },
        {
            "companyId": str(company_id),
            "name": "Le Van C",
            "skills": ["server", "web"],
            "availableNow": True,
            "homeLocation": {"lat": 10.7769, "lng": 106.7009, "address": "HCMC"},
            "dMatrix": [
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 2.6},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 3.4},
                {"typeCode": "WEB_DOWN", "mode": "R", "durationHours": 1.4},
                {"typeCode": "WEB_DOWN", "mode": "O", "durationHours": 2.1},
            ],
        },
    ]
    await db.technicians.insert_many(technicians)

    tools = [
        {"companyId": str(company_id), "name": "Boot Disk", "typeCode": "BOOT_DISK", "availableQty": 1},
        {"companyId": str(company_id), "name": "Forensic Kit", "typeCode": "FORENSIC_KIT", "availableQty": 1},
        {"companyId": str(company_id), "name": "Router Tool", "typeCode": "ROUTER_TOOL", "availableQty": 1},
        {"companyId": str(company_id), "name": "Switch Tool", "typeCode": "SWITCH_TOOL", "availableQty": 1},
    ]
    await db.tools.insert_many(tools)

    licenses = [
        {"companyId": str(company_id), "name": "NetDiagSuite", "typeCode": "NETDIAG_SUITE", "capTotal": 1, "inUseNow": 0},
        {"companyId": str(company_id), "name": "SecureScan", "typeCode": "SECURE_SCAN", "capTotal": 2, "inUseNow": 1},
    ]
    await db.licenses.insert_many(licenses)

    vehicles = [
        {"companyId": str(company_id), "availableQty": 1},
    ]
    await db.vehicles.insert_many(vehicles)

    skills = [
        {"companyId": str(company_id), "name": "server"},
        {"companyId": str(company_id), "name": "web"},
        {"companyId": str(company_id), "name": "network"},
        {"companyId": str(company_id), "name": "malware"},
    ]
    await db.skills.insert_many(skills)

    components = [
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[0]),
            "name": "Server A1",
            "type": "SERVER",
            "status": "ACTIVE",
            "location": "Rack A1",
            "serial": "SRV-A1-001",
            "ipAddress": "10.0.1.10",
            "macAddress": "00:11:22:33:44:55",
            "vendor": "Dell",
            "model": "PowerEdge R740",
            "os": "Ubuntu 22.04",
            "cpu": "Xeon Silver",
            "ramGB": 64,
            "storageGB": 2000,
            "firmware": "2.10.1",
            "networkConfig": {"subnet": "10.0.1.0/24", "gateway": "10.0.1.1", "vlan": "10"},
            "notes": "Primary web server",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[0]),
            "name": "Switch A-Core",
            "type": "SWITCH",
            "status": "ACTIVE",
            "location": "Network Closet A",
            "serial": "SWA-CORE-01",
            "ipAddress": "10.0.1.2",
            "macAddress": "00:11:22:33:44:66",
            "vendor": "Cisco",
            "model": "Catalyst 9300",
            "firmware": "17.6",
            "networkConfig": {"subnet": "10.0.1.0/24", "gateway": "10.0.1.1", "vlan": "10"},
            "notes": "Core switch",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
            "name": "Server B1",
            "type": "SERVER",
            "status": "ACTIVE",
            "location": "Rack B2",
            "serial": "SRV-B1-009",
            "ipAddress": "10.0.2.10",
            "macAddress": "00:11:22:33:44:77",
            "vendor": "HPE",
            "model": "ProLiant DL380",
            "os": "Windows Server 2022",
            "cpu": "Xeon Gold",
            "ramGB": 128,
            "storageGB": 4000,
            "firmware": "3.2.0",
            "networkConfig": {"subnet": "10.0.2.0/24", "gateway": "10.0.2.1", "vlan": "20"},
            "notes": "Database server",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
            "name": "Router B-Edge",
            "type": "ROUTER",
            "status": "ACTIVE",
            "location": "ISP Room",
            "serial": "RTR-B-01",
            "ipAddress": "10.0.2.2",
            "macAddress": "00:11:22:33:44:88",
            "vendor": "Juniper",
            "model": "MX204",
            "firmware": "21.2",
            "networkConfig": {"subnet": "10.0.2.0/24", "gateway": "10.0.2.1", "vlan": "20"},
            "notes": "Edge router",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[2]),
            "name": "Laptop C1",
            "type": "LAPTOP",
            "status": "ACTIVE",
            "location": "Office C",
            "serial": "LTP-C1-100",
            "ipAddress": "10.0.3.20",
            "macAddress": "00:11:22:33:44:99",
            "vendor": "Lenovo",
            "model": "ThinkPad X1",
            "os": "Windows 11",
            "cpu": "i7",
            "ramGB": 16,
            "storageGB": 512,
            "notes": "Staff laptop",
        },
    ]
    component_ids = (await db.components.insert_many(components)).inserted_ids

    # Seed a couple of OPEN incidents for demo
    incident_type_map = {t["code"]: t for t in incident_types}
    seeded_incidents = [
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[0]),
            "componentId": str(component_ids[0]),
            "typeCode": "WEB_DOWN",
            "priority": incident_type_map["WEB_DOWN"]["defaultPriority"],
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": True, "O": True},
            "setupRemote": incident_type_map["WEB_DOWN"]["defaultSetupRemote"],
            "requirements": incident_type_map["WEB_DOWN"]["requirements"],
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
            "componentId": str(component_ids[2]),
            "typeCode": "SERVER_NO_BOOT",
            "priority": incident_type_map["SERVER_NO_BOOT"]["defaultPriority"],
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": True, "O": True},
            "setupRemote": incident_type_map["SERVER_NO_BOOT"]["defaultSetupRemote"],
            "requirements": incident_type_map["SERVER_NO_BOOT"]["requirements"],
        },
    ]
    await db.incidents.insert_many(seeded_incidents)

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
