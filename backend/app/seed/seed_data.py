import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.security import get_password_hash


async def seed() -> None:
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_db]

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
        "name": "Bo Quoc Phong - Cum Mang Quan Su Ha Noi",
        "createdAt": datetime.now(timezone.utc),
        "hqLocation": {
            "lat": 21.0468,
            "lng": 105.7864,
            "address": "236 Hoang Quoc Viet, Nghia Do, Bac Tu Liem, Ha Noi",
        },
    }
    company_id = (await db.companies.insert_one(company)).inserted_id

    units = [
        {
            "companyId": str(company_id),
            "name": "Hoc vien KTQS (Tram ung cuu)",
            "location": {
                "lat": 21.0468,
                "lng": 105.7864,
                "address": "236 Hoang Quoc Viet, Nghia Do, Bac Tu Liem, Ha Noi",
            },
            "remoteAccessReady": True,
            "isSupportStation": True,
        },
        {
            "companyId": str(company_id),
            "name": "BTL 86 - Trung tam 186",
            "location": {
                "lat": 21.0785,
                "lng": 105.7738,
                "address": "350 Da Ton, Xuan Dinh, Bac Tu Liem, Ha Noi",
            },
            "remoteAccessReady": True,
            "isSupportStation": False,
        },
        {
            "companyId": str(company_id),
            "name": "Lu doan 126 - Hai Quan",
            "location": {
                "lat": 21.0025,
                "lng": 105.8201,
                "address": "44 Ly Thuong Kiet, Hoan Kiem, Ha Noi",
            },
            "remoteAccessReady": True,
            "isSupportStation": False,
        },
        {
            "companyId": str(company_id),
            "name": "Trung doan 600 - Phong khong",
            "location": {
                "lat": 21.0165,
                "lng": 105.7612,
                "address": "Thanh Xuan, Ha Noi",
            },
            "remoteAccessReady": False,
            "isSupportStation": False,
        },
        {
            "companyId": str(company_id),
            "name": "Vien KHCN Quan su",
            "location": {
                "lat": 21.0375,
                "lng": 105.8480,
                "address": "17 Hoang Sam, Nghia Do, Cau Giay, Ha Noi",
            },
            "remoteAccessReady": True,
            "isSupportStation": False,
        },
        {
            "companyId": str(company_id),
            "name": "Hoc vien Quoc phong",
            "location": {
                "lat": 21.0395,
                "lng": 105.8130,
                "address": "Giang Vo, Ba Dinh, Ha Noi",
            },
            "remoteAccessReady": True,
            "isSupportStation": False,
        },
        {
            "companyId": str(company_id),
            "name": "Lu doan 205 - Cong binh",
            "location": {
                "lat": 21.0710,
                "lng": 105.7505,
                "address": "Xuan Phuong, Nam Tu Liem, Ha Noi",
            },
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

    unit_users = []
    for i, uid in enumerate(unit_ids):
        unit_users.append(
            {
                "email": f"unit{i + 1}@acme.local",
                "passwordHash": get_password_hash("unit123"),
                "role": "UNIT_USER",
                "companyId": str(company_id),
                "unitId": str(uid),
            }
        )
    await db.users.insert_many(unit_users)

    incident_types = [
        {
            "code": "SERVER_NO_BOOT",
            "name": "May chu khong khoi dong",
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
            "code": "NETWORK_DOWN",
            "name": "Mat ket noi mang noi bo",
            "defaultPriority": 5,
            "defaultSetupRemote": 0.3,
            "defaultFeasRemote": False,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["network"],
                "requiredToolsByMode": {"R": [], "O": ["SWITCH_TOOL", "CABLE_KIT"]},
                "requiredLicensesByMode": {"R": [], "O": []},
                "requiresVehicleIfOnsite": True,
            },
        },
        {
            "code": "MALWARE_SPREAD",
            "name": "Lay nhiem ma doc",
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
            "code": "FIREWALL_BREACH",
            "name": "Tuong lua bi xam nhap",
            "defaultPriority": 5,
            "defaultSetupRemote": 0.5,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["firewall", "network"],
                "requiredToolsByMode": {"R": ["FORENSIC_KIT"], "O": ["FORENSIC_KIT"]},
                "requiredLicensesByMode": {"R": ["NETDIAG_SUITE"], "O": ["NETDIAG_SUITE"]},
                "requiresVehicleIfOnsite": False,
            },
        },
        {
            "code": "WEB_DOWN",
            "name": "He thong web noi bo ngung hoat dong",
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
            "code": "ROUTING_OUT",
            "name": "Sap dinh tuyen",
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
        {
            "code": "DATA_LEAK",
            "name": "Ro ri du lieu mat",
            "defaultPriority": 5,
            "defaultSetupRemote": 1.0,
            "defaultFeasRemote": True,
            "defaultFeasOnsite": True,
            "requirements": {
                "requiredSkills": ["malware", "firewall"],
                "requiredToolsByMode": {"R": ["FORENSIC_KIT"], "O": ["FORENSIC_KIT"]},
                "requiredLicensesByMode": {"R": ["SECURE_SCAN", "NETDIAG_SUITE"], "O": ["SECURE_SCAN"]},
                "requiresVehicleIfOnsite": True,
            },
        },
    ]
    await db.incident_types.insert_many(incident_types)

    station_home = {
        "lat": 21.0468,
        "lng": 105.7864,
        "address": "236 Hoang Quoc Viet, Ha Noi",
    }

    technicians = [
        {
            "companyId": str(company_id),
            "name": "Dai uy Nguyen Van Hung",
            "skills": ["server", "network", "firewall"],
            "availableNow": True,
            "homeLocation": station_home,
            "dMatrix": [
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 2.0},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 3.0},
                {"typeCode": "NETWORK_DOWN", "mode": "O", "durationHours": 2.5},
                {"typeCode": "FIREWALL_BREACH", "mode": "R", "durationHours": 3.0},
                {"typeCode": "FIREWALL_BREACH", "mode": "O", "durationHours": 4.0},
                {"typeCode": "ROUTING_OUT", "mode": "O", "durationHours": 2.0},
            ],
        },
        {
            "companyId": str(company_id),
            "name": "Thuong uy Tran Minh Duc",
            "skills": ["malware", "firewall", "web"],
            "availableNow": True,
            "homeLocation": station_home,
            "dMatrix": [
                {"typeCode": "MALWARE_SPREAD", "mode": "R", "durationHours": 3.0},
                {"typeCode": "MALWARE_SPREAD", "mode": "O", "durationHours": 4.5},
                {"typeCode": "FIREWALL_BREACH", "mode": "R", "durationHours": 2.5},
                {"typeCode": "FIREWALL_BREACH", "mode": "O", "durationHours": 3.5},
                {"typeCode": "WEB_DOWN", "mode": "R", "durationHours": 1.0},
                {"typeCode": "WEB_DOWN", "mode": "O", "durationHours": 1.5},
                {"typeCode": "DATA_LEAK", "mode": "R", "durationHours": 4.0},
                {"typeCode": "DATA_LEAK", "mode": "O", "durationHours": 5.0},
            ],
        },
        {
            "companyId": str(company_id),
            "name": "Trung uy Le Quang Vinh",
            "skills": ["network", "server", "web"],
            "availableNow": True,
            "homeLocation": station_home,
            "dMatrix": [
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 2.5},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 3.5},
                {"typeCode": "NETWORK_DOWN", "mode": "O", "durationHours": 2.0},
                {"typeCode": "WEB_DOWN", "mode": "R", "durationHours": 1.2},
                {"typeCode": "WEB_DOWN", "mode": "O", "durationHours": 2.0},
                {"typeCode": "ROUTING_OUT", "mode": "O", "durationHours": 2.5},
                {"typeCode": "ROUTING_OUT", "mode": "R", "durationHours": 2.0},
            ],
        },
        {
            "companyId": str(company_id),
            "name": "Dai uy Pham Thanh Son",
            "skills": ["malware", "server"],
            "availableNow": True,
            "homeLocation": station_home,
            "dMatrix": [
                {"typeCode": "MALWARE_SPREAD", "mode": "R", "durationHours": 2.5},
                {"typeCode": "MALWARE_SPREAD", "mode": "O", "durationHours": 3.5},
                {"typeCode": "SERVER_NO_BOOT", "mode": "R", "durationHours": 1.8},
                {"typeCode": "SERVER_NO_BOOT", "mode": "O", "durationHours": 2.8},
                {"typeCode": "DATA_LEAK", "mode": "R", "durationHours": 3.5},
                {"typeCode": "DATA_LEAK", "mode": "O", "durationHours": 5.0},
            ],
        },
        {
            "companyId": str(company_id),
            "name": "Thuong uy Hoang Duc Tuan",
            "skills": ["network", "firewall"],
            "availableNow": False,
            "homeLocation": station_home,
            "dMatrix": [
                {"typeCode": "NETWORK_DOWN", "mode": "O", "durationHours": 1.5},
                {"typeCode": "FIREWALL_BREACH", "mode": "R", "durationHours": 2.0},
                {"typeCode": "FIREWALL_BREACH", "mode": "O", "durationHours": 3.0},
                {"typeCode": "ROUTING_OUT", "mode": "O", "durationHours": 1.8},
            ],
        },
    ]
    await db.technicians.insert_many(technicians)

    tools = [
        {"companyId": str(company_id), "name": "Boot Disk", "typeCode": "BOOT_DISK", "availableQty": 2},
        {"companyId": str(company_id), "name": "Forensic Kit", "typeCode": "FORENSIC_KIT", "availableQty": 2},
        {"companyId": str(company_id), "name": "Router Tool", "typeCode": "ROUTER_TOOL", "availableQty": 1},
        {"companyId": str(company_id), "name": "Switch Tool", "typeCode": "SWITCH_TOOL", "availableQty": 2},
        {"companyId": str(company_id), "name": "Cable Kit", "typeCode": "CABLE_KIT", "availableQty": 3},
    ]
    await db.tools.insert_many(tools)

    licenses = [
        {"companyId": str(company_id), "name": "NetDiag Suite", "typeCode": "NETDIAG_SUITE", "capTotal": 3, "inUseNow": 0},
        {"companyId": str(company_id), "name": "Secure Scan", "typeCode": "SECURE_SCAN", "capTotal": 2, "inUseNow": 0},
    ]
    await db.licenses.insert_many(licenses)

    vehicles = [
        {"companyId": str(company_id), "availableQty": 2},
    ]
    await db.vehicles.insert_many(vehicles)

    skills = [
        {"companyId": str(company_id), "name": "server"},
        {"companyId": str(company_id), "name": "web"},
        {"companyId": str(company_id), "name": "network"},
        {"companyId": str(company_id), "name": "malware"},
        {"companyId": str(company_id), "name": "firewall"},
    ]
    await db.skills.insert_many(skills)

    components = [
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
            "name": "Server TTCH-186-01",
            "type": "SERVER",
            "status": "ACTIVE",
            "location": "Phong may chu TT186",
            "serial": "SRV-186-001",
            "ipAddress": "10.86.1.10",
            "macAddress": "00:1A:2B:3C:4D:01",
            "vendor": "Dell",
            "model": "PowerEdge R750",
            "os": "CentOS 8",
            "cpu": "Xeon Gold 6330",
            "ramGB": 128,
            "storageGB": 4000,
            "firmware": "2.12.0",
            "networkConfig": {"subnet": "10.86.1.0/24", "gateway": "10.86.1.1", "vlan": "86"},
            "notes": "May chu tac chien KGM",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
            "name": "Firewall BTL86-FW01",
            "type": "FIREWALL",
            "status": "ACTIVE",
            "location": "Phong NOC TT186",
            "serial": "FW-186-001",
            "ipAddress": "10.86.1.1",
            "macAddress": "00:1A:2B:3C:4D:02",
            "vendor": "Fortinet",
            "model": "FortiGate 600E",
            "firmware": "7.2.5",
            "networkConfig": {"subnet": "10.86.1.0/24", "gateway": "10.86.1.1", "vlan": "86"},
            "notes": "Tuong lua chinh",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[2]),
            "name": "Switch Core LD126-SW01",
            "type": "SWITCH",
            "status": "ACTIVE",
            "location": "Phong mang LD126",
            "serial": "SW-126-001",
            "ipAddress": "10.126.1.2",
            "macAddress": "00:1A:2B:3C:4D:03",
            "vendor": "Cisco",
            "model": "Catalyst 9300",
            "firmware": "17.6",
            "networkConfig": {"subnet": "10.126.1.0/24", "gateway": "10.126.1.1", "vlan": "126"},
            "notes": "Switch loi",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[3]),
            "name": "Server TD600-SRV01",
            "type": "SERVER",
            "status": "ACTIVE",
            "location": "Phong may chu TD600",
            "serial": "SRV-600-001",
            "ipAddress": "10.60.1.10",
            "macAddress": "00:1A:2B:3C:4D:04",
            "vendor": "HPE",
            "model": "ProLiant DL380",
            "os": "Ubuntu 22.04",
            "cpu": "Xeon Silver 4314",
            "ramGB": 64,
            "storageGB": 2000,
            "firmware": "3.0.1",
            "networkConfig": {"subnet": "10.60.1.0/24", "gateway": "10.60.1.1", "vlan": "60"},
            "notes": "May chu radar",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[4]),
            "name": "Server VKHCN-SRV01",
            "type": "SERVER",
            "status": "ACTIVE",
            "location": "Phong lab Vien KHCN",
            "serial": "SRV-VKH-001",
            "ipAddress": "10.37.1.10",
            "macAddress": "00:1A:2B:3C:4D:05",
            "vendor": "Dell",
            "model": "PowerEdge R740",
            "os": "Windows Server 2022",
            "cpu": "Xeon Gold 5318Y",
            "ramGB": 256,
            "storageGB": 8000,
            "firmware": "2.10.2",
            "networkConfig": {"subnet": "10.37.1.0/24", "gateway": "10.37.1.1", "vlan": "37"},
            "notes": "May chu nghien cuu",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[4]),
            "name": "Router VKHCN-RT01",
            "type": "ROUTER",
            "status": "ACTIVE",
            "location": "Phong NOC Vien KHCN",
            "serial": "RT-VKH-001",
            "ipAddress": "10.37.1.1",
            "macAddress": "00:1A:2B:3C:4D:06",
            "vendor": "Juniper",
            "model": "MX204",
            "firmware": "22.1",
            "networkConfig": {"subnet": "10.37.1.0/24", "gateway": "10.37.1.1", "vlan": "37"},
            "notes": "Router bien",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[5]),
            "name": "Firewall HVQP-FW01",
            "type": "FIREWALL",
            "status": "ACTIVE",
            "location": "Phong CNTT HVQP",
            "serial": "FW-HVQP-001",
            "ipAddress": "10.50.1.1",
            "macAddress": "00:1A:2B:3C:4D:07",
            "vendor": "Palo Alto",
            "model": "PA-3260",
            "firmware": "11.0",
            "networkConfig": {"subnet": "10.50.1.0/24", "gateway": "10.50.1.1", "vlan": "50"},
            "notes": "Tuong lua hoc vien",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[6]),
            "name": "Switch LD205-SW01",
            "type": "SWITCH",
            "status": "ACTIVE",
            "location": "Phong chi huy LD205",
            "serial": "SW-205-001",
            "ipAddress": "10.205.1.2",
            "macAddress": "00:1A:2B:3C:4D:08",
            "vendor": "Cisco",
            "model": "Catalyst 2960",
            "firmware": "15.2",
            "networkConfig": {"subnet": "10.205.1.0/24", "gateway": "10.205.1.1", "vlan": "205"},
            "notes": "Switch chi huy",
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[0]),
            "name": "Server HVKTQS-SRV01",
            "type": "SERVER",
            "status": "ACTIVE",
            "location": "Trung tam tinh toan HVKTQS",
            "serial": "SRV-MTA-001",
            "ipAddress": "10.10.1.10",
            "macAddress": "00:1A:2B:3C:4D:09",
            "vendor": "Dell",
            "model": "PowerEdge R650",
            "os": "Rocky Linux 9",
            "cpu": "Xeon Gold 6338",
            "ramGB": 512,
            "storageGB": 16000,
            "firmware": "2.14.0",
            "networkConfig": {"subnet": "10.10.1.0/24", "gateway": "10.10.1.1", "vlan": "10"},
            "notes": "May chu trung tam",
        },
    ]
    component_ids = (await db.components.insert_many(components)).inserted_ids

    incident_type_map = {t["code"]: t for t in incident_types}

    seeded_incidents = [
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
            "componentId": str(component_ids[0]),
            "typeCode": "MALWARE_SPREAD",
            "priority": 5,
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": True, "O": True},
            "setupRemote": incident_type_map["MALWARE_SPREAD"]["defaultSetupRemote"],
            "requirements": incident_type_map["MALWARE_SPREAD"]["requirements"],
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[1]),
            "componentId": str(component_ids[1]),
            "typeCode": "FIREWALL_BREACH",
            "priority": 5,
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": True, "O": True},
            "setupRemote": incident_type_map["FIREWALL_BREACH"]["defaultSetupRemote"],
            "requirements": incident_type_map["FIREWALL_BREACH"]["requirements"],
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[2]),
            "componentId": str(component_ids[2]),
            "typeCode": "NETWORK_DOWN",
            "priority": 5,
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": False, "O": True},
            "setupRemote": incident_type_map["NETWORK_DOWN"]["defaultSetupRemote"],
            "requirements": incident_type_map["NETWORK_DOWN"]["requirements"],
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[3]),
            "componentId": str(component_ids[3]),
            "typeCode": "SERVER_NO_BOOT",
            "priority": 5,
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": True, "O": True},
            "setupRemote": incident_type_map["SERVER_NO_BOOT"]["defaultSetupRemote"],
            "requirements": incident_type_map["SERVER_NO_BOOT"]["requirements"],
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[4]),
            "componentId": str(component_ids[5]),
            "typeCode": "ROUTING_OUT",
            "priority": 3,
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": False, "O": True},
            "setupRemote": incident_type_map["ROUTING_OUT"]["defaultSetupRemote"],
            "requirements": incident_type_map["ROUTING_OUT"]["requirements"],
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[5]),
            "componentId": str(component_ids[6]),
            "typeCode": "FIREWALL_BREACH",
            "priority": 5,
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": True, "O": True},
            "setupRemote": incident_type_map["FIREWALL_BREACH"]["defaultSetupRemote"],
            "requirements": incident_type_map["FIREWALL_BREACH"]["requirements"],
        },
        {
            "companyId": str(company_id),
            "unitId": str(unit_ids[4]),
            "componentId": str(component_ids[4]),
            "typeCode": "DATA_LEAK",
            "priority": 5,
            "status": "OPEN",
            "reportedAt": datetime.now(timezone.utc),
            "modeFeas": {"R": True, "O": True},
            "setupRemote": incident_type_map["DATA_LEAK"]["defaultSetupRemote"],
            "requirements": incident_type_map["DATA_LEAK"]["requirements"],
        },
    ]
    await db.incidents.insert_many(seeded_incidents)

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
