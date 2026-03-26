from __future__ import annotations

from dataclasses import dataclass
from math import radians, sin, cos, sqrt, atan2
from typing import Any

from app.db.mongo import oid

try:
    from ortools.sat.python import cp_model
    _ORTOOLS_AVAILABLE = True
except Exception:  # pragma: no cover - fallback path
    cp_model = None
    _ORTOOLS_AVAILABLE = False


@dataclass
class Instance:
    company_id: str
    incidents: list[dict]
    technicians: list[dict]
    tools: dict[str, int]
    licenses: dict[str, int]
    vehicles: int
    travel_time: dict[tuple[str, str], float]
    time_to_restore_min: dict[tuple[str, str, str], int]
    travel_cost_units: dict[tuple[str, str], int]


SPEED_KMH = 40.0
TRAVEL_COST_FACTOR = 50.0
COST_SCALE = 100  # scale travel cost to integer


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


def _duration_lookup(tech: dict) -> dict[tuple[str, str], float]:
    mapping: dict[tuple[str, str], float] = {}
    for entry in tech.get("dMatrix", []):
        mapping[(entry["typeCode"], entry["mode"])] = float(entry["durationHours"])
    return mapping


async def build_instance(db, company_id: str, incident_ids: list[str] | None = None, max_incidents: int | None = None) -> Instance:
    def _maybe_oid(value):
        return oid(value) if isinstance(value, str) else value

    query: dict[str, Any] = {"companyId": company_id, "status": "OPEN"}
    if incident_ids:
        query["_id"] = {"$in": [_maybe_oid(i) for i in incident_ids]}

    cursor = db.incidents.find(query).sort("priority", -1)
    if max_incidents:
        cursor = cursor.limit(max_incidents)
    incidents = await cursor.to_list(1000)

    unit_ids = list({inc["unitId"] for inc in incidents})
    units = await db.units.find({"_id": {"$in": [_maybe_oid(u) for u in unit_ids]}}).to_list(1000)
    unit_map = {str(u["_id"]): u for u in units}
    support_station = await db.units.find_one({"companyId": company_id, "isSupportStation": True})
    station_location = support_station.get("location") if support_station else None

    techs = await db.technicians.find({"companyId": company_id, "availableNow": True}).to_list(1000)

    tools = await db.tools.find({"companyId": company_id}).to_list(1000)
    tool_avail = {t["typeCode"]: int(t.get("availableQty", 0)) for t in tools}

    licenses = await db.licenses.find({"companyId": company_id}).to_list(1000)
    license_avail = {l["typeCode"]: int(l.get("capTotal", 0)) - int(l.get("inUseNow", 0)) for l in licenses}

    vehicles_docs = await db.vehicles.find({"companyId": company_id}).to_list(1000)
    vehicles_avail = sum(int(v.get("availableQty", 0)) for v in vehicles_docs)

    # Ensure all required tool/license codes appear with at least 0 availability
    required_tool_codes: set[str] = set()
    required_license_codes: set[str] = set()
    for inc in incidents:
        req = inc.get("requirements", {}) or {}
        tools_by_mode = req.get("requiredToolsByMode", {}) or {}
        licenses_by_mode = req.get("requiredLicensesByMode", {}) or {}
        for mode in ["R", "O"]:
            required_tool_codes.update(tools_by_mode.get(mode, []))
            required_license_codes.update(licenses_by_mode.get(mode, []))

    for code in required_tool_codes:
        tool_avail.setdefault(code, 0)
    for code in required_license_codes:
        license_avail.setdefault(code, 0)

    travel_time: dict[tuple[str, str], float] = {}
    time_to_restore_min: dict[tuple[str, str, str], int] = {}
    travel_cost_units: dict[tuple[str, str], int] = {}

    for tech in techs:
        tech_id = str(tech["_id"])
        d_lookup = _duration_lookup(tech)
        origin = station_location or tech.get("homeLocation")
        origin_lat = origin.get("lat") if origin else None
        origin_lng = origin.get("lng") if origin else None
        for inc in incidents:
            inc_id = str(inc["_id"])
            unit = unit_map.get(inc["unitId"])
            if not unit:
                continue
            travel_hours = None
            if origin_lat is not None and origin_lng is not None:
                dist_km = haversine_km(
                    origin_lat,
                    origin_lng,
                    unit["location"]["lat"],
                    unit["location"]["lng"],
                )
                travel_hours = dist_km / SPEED_KMH
                travel_time[(tech_id, inc_id)] = travel_hours
                travel_cost_units[(tech_id, inc_id)] = int(round((TRAVEL_COST_FACTOR * travel_hours) * COST_SCALE))

            for mode in ["R", "O"]:
                if (inc.get("modeFeas", {}) or {}).get(mode) is False:
                    continue
                if (inc.get("typeCode"), mode) not in d_lookup:
                    continue
                if mode == "O":
                    if travel_hours is None:
                        continue
                    base = travel_hours
                else:
                    base = float(inc.get("setupRemote", 0.0))
                total_hours = base + d_lookup[(inc.get("typeCode"), mode)]
                time_to_restore_min[(tech_id, inc_id, mode)] = int(round(total_hours * 60))

    return Instance(
        company_id=company_id,
        incidents=incidents,
        technicians=techs,
        tools=tool_avail,
        licenses=license_avail,
        vehicles=vehicles_avail,
        travel_time=travel_time,
        time_to_restore_min=time_to_restore_min,
        travel_cost_units=travel_cost_units,
    )


@dataclass
class SolveResult:
    assignments: list[dict]
    objectives: dict


def _feasible_triples(instance: Instance) -> list[tuple[str, str, str]]:
    triples: list[tuple[str, str, str]] = []
    for tech in instance.technicians:
        tech_id = str(tech["_id"])
        tech_skills = set(tech.get("skills", []))
        for inc in instance.incidents:
            inc_id = str(inc["_id"])
            req = inc.get("requirements", {})
            required_skills = set(req.get("requiredSkills", []))
            if not required_skills.issubset(tech_skills):
                continue
            for mode in ["R", "O"]:
                if (inc.get("modeFeas", {}) or {}).get(mode) is False:
                    continue
                if (tech_id, inc_id, mode) not in instance.time_to_restore_min:
                    continue
                triples.append((tech_id, inc_id, mode))
    return triples


def solve(instance: Instance) -> SolveResult:
    if not _ORTOOLS_AVAILABLE:
        return _solve_enum(instance)

    triples = _feasible_triples(instance)
    if not triples:
        return SolveResult(assignments=[], objectives={"Z1": 0, "Z2": 0, "Z3": 0})

    model = cp_model.CpModel()

    incident_map = {str(inc["_id"]): inc for inc in instance.incidents}

    x: dict[tuple[str, str, str], cp_model.IntVar] = {}
    for t, i, m in triples:
        x[(t, i, m)] = model.NewBoolVar(f"x_{t}_{i}_{m}")

    # Each incident at most one assignment
    for inc in instance.incidents:
        inc_id = str(inc["_id"])
        vars_for_inc = [x[key] for key in x if key[1] == inc_id]
        if vars_for_inc:
            model.Add(sum(vars_for_inc) <= 1)

    # Each tech at most one incident
    for tech in instance.technicians:
        tech_id = str(tech["_id"])
        vars_for_tech = [x[key] for key in x if key[0] == tech_id]
        if vars_for_tech:
            model.Add(sum(vars_for_tech) <= 1)

    # Tools constraints
    for tool_code, avail in instance.tools.items():
        consumption = []
        for (t, i, m), var in x.items():
            inc = incident_map[i]
            req_tools = (inc.get("requirements", {}) or {}).get("requiredToolsByMode", {}).get(m, [])
            if tool_code in req_tools:
                consumption.append(var)
        if consumption:
            model.Add(sum(consumption) <= avail)

    # Licenses constraints
    for lic_code, avail in instance.licenses.items():
        consumption = []
        for (t, i, m), var in x.items():
            inc = incident_map[i]
            req_lics = (inc.get("requirements", {}) or {}).get("requiredLicensesByMode", {}).get(m, [])
            if lic_code in req_lics:
                consumption.append(var)
        if consumption:
            model.Add(sum(consumption) <= max(avail, 0))

    # Vehicles constraint
    vehicle_consumption = []
    for (t, i, m), var in x.items():
        if m != "O":
            continue
        inc = incident_map[i]
        if (inc.get("requirements", {}) or {}).get("requiresVehicleIfOnsite", False):
            vehicle_consumption.append(var)
    if vehicle_consumption:
        model.Add(sum(vehicle_consumption) <= instance.vehicles)

    # Objectives
    z1_terms = []
    z2_terms = []
    z3_terms = []
    for (t, i, m), var in x.items():
        inc = incident_map[i]
        priority = int(inc.get("priority", 1))
        z1_terms.append(priority * var)
        time_min = instance.time_to_restore_min[(t, i, m)]
        z2_terms.append(priority * time_min * var)
        if m == "O":
            z3_terms.append(instance.travel_cost_units[(t, i)] * var)

    z1_expr = sum(z1_terms) if z1_terms else 0
    z2_expr = sum(z2_terms) if z2_terms else 0
    z3_expr = sum(z3_terms) if z3_terms else 0

    solver = cp_model.CpSolver()

    model.Maximize(z1_expr)
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(assignments=[], objectives={"Z1": 0, "Z2": 0, "Z3": 0})
    z1_opt = int(solver.Value(z1_expr))

    model.Add(z1_expr == z1_opt)
    model.Minimize(z2_expr)
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(assignments=[], objectives={"Z1": z1_opt, "Z2": 0, "Z3": 0})
    z2_opt = int(solver.Value(z2_expr))

    model.Add(z2_expr == z2_opt)
    model.Minimize(z3_expr)
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveResult(assignments=[], objectives={"Z1": z1_opt, "Z2": z2_opt, "Z3": 0})
    z3_opt = int(solver.Value(z3_expr))

    assignments = []
    for (t, i, m), var in x.items():
        if solver.Value(var) == 1:
            inc = next(inc for inc in instance.incidents if str(inc["_id"]) == i)
            req = inc.get("requirements", {}) or {}
            assignments.append(
                {
                    "incidentId": i,
                    "technicianId": t,
                    "mode": m,
                    "allocatedTools": req.get("requiredToolsByMode", {}).get(m, []),
                    "allocatedLicenses": req.get("requiredLicensesByMode", {}).get(m, []),
                    "vehicleAllocated": bool(req.get("requiresVehicleIfOnsite", False) and m == "O"),
                    "timeToRestoreEstimateHours": instance.time_to_restore_min[(t, i, m)] / 60.0,
                }
            )

    return SolveResult(assignments=assignments, objectives={"Z1": z1_opt, "Z2": z2_opt, "Z3": z3_opt})


def _solve_enum(instance: Instance) -> SolveResult:
    # Naive exact enumeration for small instances
    triples = _feasible_triples(instance)
    if not triples:
        return SolveResult(assignments=[], objectives={"Z1": 0, "Z2": 0, "Z3": 0})

    incident_map = {str(inc["_id"]): inc for inc in instance.incidents}

    best = None

    def score(assignments: list[tuple[str, str, str]]):
        z1 = 0
        z2 = 0
        z3 = 0
        for t, i, m in assignments:
            inc = incident_map[i]
            priority = int(inc.get("priority", 1))
            z1 += priority
            z2 += priority * instance.time_to_restore_min[(t, i, m)]
            if m == "O":
                z3 += instance.travel_cost_units[(t, i)]
        return z1, z2, z3

    # Very naive: try all single-incident assignments only
    for t, i, m in triples:
        assignments = [(t, i, m)]
        z1, z2, z3 = score(assignments)
        if best is None or (z1, -z2, -z3) > (best[0], -best[1], -best[2]):
            best = (z1, z2, z3, assignments)

    if best is None:
        return SolveResult(assignments=[], objectives={"Z1": 0, "Z2": 0, "Z3": 0})

    assignments = []
    for t, i, m in best[3]:
        inc = incident_map[i]
        req = inc.get("requirements", {}) or {}
        assignments.append(
            {
                "incidentId": i,
                "technicianId": t,
                "mode": m,
                "allocatedTools": req.get("requiredToolsByMode", {}).get(m, []),
                "allocatedLicenses": req.get("requiredLicensesByMode", {}).get(m, []),
                "vehicleAllocated": bool(req.get("requiresVehicleIfOnsite", False) and m == "O"),
                "timeToRestoreEstimateHours": instance.time_to_restore_min[(t, i, m)] / 60.0,
            }
        )

    return SolveResult(assignments=assignments, objectives={"Z1": best[0], "Z2": best[1], "Z3": best[2]})


def _dedupe_reasons(reasons: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for reason in reasons:
        if reason in seen:
            continue
        seen.add(reason)
        deduped.append(reason)
    return deduped


def build_unassigned_reasons(instance: Instance, assignments: list[dict]) -> list[dict]:
    assigned_ids = {a.get("incidentId") for a in assignments}
    unassigned: list[dict] = []
    tech_by_id = {str(tech["_id"]): tech for tech in instance.technicians}

    for inc in instance.incidents:
        inc_id = str(inc["_id"])
        if inc_id in assigned_ids:
            continue

        req = inc.get("requirements", {}) or {}
        mode_feas = inc.get("modeFeas", {}) or {}
        required_skills = set(req.get("requiredSkills", []))
        reasons: list[str] = []
        mode_ready = False

        if not instance.technicians:
            reasons.append("No technicians are currently available.")

        if not mode_feas.get("R", False) and not mode_feas.get("O", False):
            reasons.append("Incident is not feasible in remote or onsite mode.")

        for mode in ["R", "O"]:
            if not mode_feas.get(mode, False):
                continue

            mode_name = "remote" if mode == "R" else "onsite"
            qualified = []
            for tech_id, tech in tech_by_id.items():
                tech_skills = set(tech.get("skills", []))
                if required_skills.issubset(tech_skills):
                    qualified.append(tech_id)

            if not qualified:
                reasons.append(f"No available technician has required skills for {mode_name} mode.")
                continue

            qualified_with_duration = [
                tech_id
                for tech_id in qualified
                if (tech_id, inc_id, mode) in instance.time_to_restore_min
            ]
            if not qualified_with_duration:
                reasons.append(f"No qualified technician has dMatrix duration data for {mode_name} mode.")
                continue

            missing_tools = sorted(
                {
                    code
                    for code in req.get("requiredToolsByMode", {}).get(mode, [])
                    if instance.tools.get(code, 0) <= 0
                }
            )
            missing_licenses = sorted(
                {
                    code
                    for code in req.get("requiredLicensesByMode", {}).get(mode, [])
                    if instance.licenses.get(code, 0) <= 0
                }
            )
            missing_vehicle = bool(mode == "O" and req.get("requiresVehicleIfOnsite", False) and instance.vehicles <= 0)

            if missing_tools:
                reasons.append(f"Insufficient tools for {mode_name} mode: {', '.join(missing_tools)}.")
            if missing_licenses:
                reasons.append(f"Insufficient licenses for {mode_name} mode: {', '.join(missing_licenses)}.")
            if missing_vehicle:
                reasons.append("No vehicle is available for onsite dispatch.")

            if not missing_tools and not missing_licenses and not missing_vehicle:
                mode_ready = True

        if mode_ready:
            reasons.append(
                "Feasible in isolation, but not selected in this optimization run due to technician/resource trade-offs."
            )

        deduped = _dedupe_reasons(reasons)
        if not deduped:
            deduped = ["No feasible assignment found for this optimization run."]

        unassigned.append(
            {
                "incidentId": inc_id,
                "typeCode": inc.get("typeCode", ""),
                "priority": int(inc.get("priority", 1)),
                "reasons": deduped,
            }
        )

    return unassigned
