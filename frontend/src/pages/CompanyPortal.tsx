import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Collapse,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Select,
  Checkbox,
  Typography
} from '@mui/material'
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import api from '../api'
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material'
import type {
  Component,
  DispatchRun,
  Incident,
  IncidentType,
  OptimizeResult,
  Skill,
  Tool,
  License,
  Technician,
  Unit,
  User,
  Vehicle
} from '../types'

const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILES_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const MAP_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'


const _rawRouter = import.meta.env.VITE_ROUTER_URL || ''
const ROUTER_BASE_URL = (
  _rawRouter && !_rawRouter.includes('localhost') && !_rawRouter.includes('127.0.0.1')
    ? _rawRouter
    : 'https://router.project-osrm.org'
).replace(/\/$/, '')

const MAP_STATE_KEY = 'company_map_state'

const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
})
L.Marker.prototype.options.icon = DefaultIcon

const pulseIcon = L.divIcon({
  className: 'pulse-marker',
  html: '<span class="pulse-ring"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
})

const supportStationIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: 'support-station-icon'
})

interface RouteInfo {
  coords: [number, number][]
  distance: number | null
  duration: number | null
}

const routeCache = new Map<string, RouteInfo>()

function routeCacheKey(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (n: number) => Math.round(n * 1e4)
  return `${r(lat1)},${r(lng1)}-${r(lat2)},${r(lng2)}`
}

async function fetchOsrmRoute(
  fLat: number, fLng: number, tLat: number, tLng: number, signal?: AbortSignal
): Promise<RouteInfo> {
  const key = routeCacheKey(fLat, fLng, tLat, tLng)
  const cached = routeCache.get(key)
  if (cached) return cached
  try {
    const url = `${ROUTER_BASE_URL}/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error('fail')
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route?.geometry?.coordinates?.length) throw new Error('no route')
    const info: RouteInfo = {
      coords: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]),
      distance: route.distance ?? null,
      duration: route.duration ?? null
    }
    routeCache.set(key, info)
    return info
  } catch {
    // Fallback: đường thẳng khi không gọi được OSRM
    return { coords: [[fLat, fLng], [tLat, tLng]], distance: null, duration: null }
  }
}

function fmtDistance(m: number | null) {
  if (m == null) return '--'
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function fmtDuration(s: number | null) {
  if (s == null) return '--'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}p` : `${m} phút`
}

function getSavedMapState(): { center: [number, number]; zoom: number } | null {
  try {
    const raw = localStorage.getItem(MAP_STATE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (Array.isArray(obj.center) && typeof obj.zoom === 'number') return obj
  } catch { /* bỏ qua */ }
  return null
}

function saveMapState(center: [number, number], zoom: number) {
  localStorage.setItem(MAP_STATE_KEY, JSON.stringify({ center, zoom }))
}

function MapStateTracker() {
  const map = useMap()
  useMapEvents({
    moveend() { const c = map.getCenter(); saveMapState([c.lat, c.lng], map.getZoom()) },
    zoomend() { const c = map.getCenter(); saveMapState([c.lat, c.lng], map.getZoom()) }
  })
  return null
}

function UnitLocationPicker({
  lat, lng, onChange
}: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  function ClickHandler() {
    useMapEvents({ click(event) { onChange(event.latlng.lat, event.latlng.lng) } })
    return null
  }
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : [16.0, 106.0]
  return (
    <Box className="unit-map-shell">
      <MapContainer center={center} zoom={lat != null && lng != null ? 12 : 5} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        <ClickHandler />
        {lat != null && lng != null && <Marker position={[lat, lng]} />}
      </MapContainer>
    </Box>
  )
}

interface RoutableIncident extends Incident {
  _routeType: 'dispatched' | 'open'
}

interface CompanyPortalProps { user: User }

function CompanyPortal({ user }: CompanyPortalProps) {
  const [units, setUnits] = useState<Unit[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([])
  const [dispatchRuns, setDispatchRuns] = useState<DispatchRun[]>([])
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [routeLines, setRouteLines] = useState<Record<string, RouteInfo>>({})
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewResult, setPreviewResult] = useState<OptimizeResult | null>(null)

  const unitNameById = useMemo(() => new Map(units.map((u) => [u._id, u.name])), [units])
  const unitById = useMemo(() => new Map(units.map((u) => [u._id, u])), [units])
  const techNameById = useMemo(() => new Map(technicians.map((t) => [t._id, t.name])), [technicians])
  const incidentById = useMemo(() => new Map(incidents.map((i) => [i._id, i])), [incidents])
  const componentNameById = new Map(components.map((c) => [c._id, c.name]))

  const [mainTab, setMainTab] = useState(0)
  const [manageTab, setManageTab] = useState(0)
  const [incidentPage, setIncidentPage] = useState(0)
  const [incidentPriorityEdits, setIncidentPriorityEdits] = useState<Record<string, number>>({})
  const [incidentModeREdits, setIncidentModeREdits] = useState<Record<string, boolean>>({})
  const [incidentModeOEdits, setIncidentModeOEdits] = useState<Record<string, boolean>>({})
  const [expandedIncidents, setExpandedIncidents] = useState<Record<string, boolean>>({})
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false)
  const [requirementsIncidentId, setRequirementsIncidentId] = useState<string | null>(null)
  const [requirementsForm, setRequirementsForm] = useState({
    requiredSkills: [] as string[],
    toolsR: [] as string[],
    toolsO: [] as string[],
    licensesR: [] as string[],
    licensesO: [] as string[],
    requiresVehicleIfOnsite: false
  })

  const [techForm, setTechForm] = useState({
    name: '', skills: [] as string[], lat: '', lng: '', address: '', availableNow: true,
    dMatrixRows: [] as Array<{ typeCode: string; mode: 'R' | 'O'; durationHours: string }>
  })
  const [toolForm, setToolForm] = useState({ name: '', typeCode: '', availableQty: 1 })
  const [licenseForm, setLicenseForm] = useState({ name: '', typeCode: '', capTotal: 1, inUseNow: 0 })
  const [vehicleForm, setVehicleForm] = useState({ availableQty: 1 })
  const [techDialogOpen, setTechDialogOpen] = useState(false)
  const [techDialogMode, setTechDialogMode] = useState<'add' | 'edit'>('add')
  const [editingTechId, setEditingTechId] = useState<string | null>(null)
  const [toolDialogOpen, setToolDialogOpen] = useState(false)
  const [toolDialogMode, setToolDialogMode] = useState<'add' | 'edit'>('add')
  const [editingToolId, setEditingToolId] = useState<string | null>(null)
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false)
  const [licenseDialogMode, setLicenseDialogMode] = useState<'add' | 'edit'>('add')
  const [editingLicenseId, setEditingLicenseId] = useState<string | null>(null)
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false)
  const [vehicleDialogMode, setVehicleDialogMode] = useState<'add' | 'edit'>('add')
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const [unitDialogOpen, setUnitDialogOpen] = useState(false)
  const [unitDialogMode, setUnitDialogMode] = useState<'add' | 'edit'>('add')
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
  const [unitForm, setUnitForm] = useState({
    name: '', address: '', lat: '', lng: '', remoteAccessReady: false, isSupportStation: false
  })
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  const [skillDialogMode, setSkillDialogMode] = useState<'add' | 'edit'>('add')
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [skillForm, setSkillForm] = useState({ name: '' })
  const [incidentTypeDialogOpen, setIncidentTypeDialogOpen] = useState(false)
  const [incidentTypeDialogMode, setIncidentTypeDialogMode] = useState<'add' | 'edit'>('add')
  const [editingIncidentTypeId, setEditingIncidentTypeId] = useState<string | null>(null)
  const [incidentTypeForm, setIncidentTypeForm] = useState({
    code: '', name: '', defaultPriority: 3, defaultSetupRemote: 0.5,
    defaultFeasRemote: true, defaultFeasOnsite: true, requiredSkills: [] as string[],
    toolsR: '', toolsO: '', licensesR: '', licensesO: '', requiresVehicleIfOnsite: false
  })

  const availableTechs = technicians.filter((t) => t.availableNow).length
  const vehicleQty = vehicles.reduce((sum, v) => sum + v.availableQty, 0)
  const existingStation = units.find((u) => u.isSupportStation)
  const stationLocked = Boolean(existingStation && existingStation._id !== editingUnitId)
  const stationLocation = existingStation?.location

  const toolTypeOptions = Array.from(
    new Map([
      ...tools.map((tool) => [tool.typeCode, tool.name]),
      ...requirementsForm.toolsR.map((code) => [code, code]),
      ...requirementsForm.toolsO.map((code) => [code, code])
    ] as Array<[string, string]>).entries()
  ).map(([typeCode, name]) => ({ typeCode, name }))

  const licenseTypeOptions = Array.from(
    new Map([
      ...licenses.map((lic) => [lic.typeCode, lic.name]),
      ...requirementsForm.licensesR.map((code) => [code, code]),
      ...requirementsForm.licensesO.map((code) => [code, code])
    ] as Array<[string, string]>).entries()
  ).map(([typeCode, name]) => ({ typeCode, name }))

  const activeIncidents = incidents.filter((inc) => inc.status !== 'RESOLVED')
  const onsiteDispatches = activeIncidents.filter((inc) => inc.dispatch?.mode === 'O')
  const openIncidents = activeIncidents.filter((inc) => inc.status === 'OPEN')

  const routableIncidents = useMemo<RoutableIncident[]>(() => {
    const dispatched: RoutableIncident[] = onsiteDispatches.map((inc) => ({ ...inc, _routeType: 'dispatched' }))
    const open: RoutableIncident[] = openIncidents
      .filter((inc) => !onsiteDispatches.some((d) => d._id === inc._id))
      .map((inc) => ({ ...inc, _routeType: 'open' }))
    return [...dispatched, ...open]
  }, [onsiteDispatches, openIncidents])

  const routableKey = useMemo(
    () => routableIncidents.map((i) => `${i._id}:${i._routeType}:${i.unitId}`).join('|'),
    [routableIncidents]
  )

  const fallbackLines = useMemo<Record<string, RouteInfo>>(() => {
    if (!stationLocation) return {}
    const entries: [string, RouteInfo][] = []
    for (const inc of routableIncidents) {
      const unit = unitById.get(inc.unitId)
      if (!unit?.location) continue
      entries.push([inc._id, {
        coords: [[stationLocation.lat, stationLocation.lng], [unit.location.lat, unit.location.lng]],
        distance: null,
        duration: null
      }])
    }
    return Object.fromEntries(entries)
  }, [stationLocation, routableKey, unitById])

  const incidentRowsPerPage = 5
  const pagedIncidents = activeIncidents.slice(
    incidentPage * incidentRowsPerPage,
    incidentPage * incidentRowsPerPage + incidentRowsPerPage
  )

  const statusLabel = (status: string) => {
    if (status === 'DISPATCHED' || status === 'IN_PROGRESS' || status === 'DISPATCHING') return 'Đang điều phối'
    if (status === 'OPEN') return 'Mới báo cáo'
    if (status === 'RESOLVED') return 'Hoàn thành'
    return status
  }

  const statusBuckets = [
    { key: 'OPEN',       label: 'Mới báo cáo',    color: '#0277bd' },
    { key: 'DISPATCHING',label: 'Đang điều phối',  color: '#f9a825' },
    { key: 'RESOLVED',   label: 'Hoàn thành',      color: '#2e7d32' }
  ]
  const rawStatusCounts = incidents.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.status] = (acc[inc.status] ?? 0) + 1; return acc
  }, {})
  const statusCounts: Record<string, number> = {
    OPEN: rawStatusCounts.OPEN ?? 0,
    DISPATCHING: (rawStatusCounts.DISPATCHED ?? 0) + (rawStatusCounts.IN_PROGRESS ?? 0),
    RESOLVED: rawStatusCounts.RESOLVED ?? 0
  }
  const maxStatusCount = Math.max(1, ...statusBuckets.map((b) => statusCounts[b.key] ?? 0))
  const typeCounts = incidents.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.typeCode] = (acc[inc.typeCode] ?? 0) + 1; return acc
  }, {})
  const typeData = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxTypeCount = Math.max(1, ...typeData.map(([, count]) => count))

  const load = async () => {
    const [unitsRes, incRes, techRes, toolRes, licRes, vehRes, compRes, skillsRes, typesRes, runsRes] =
      await Promise.all([
        api.get<Unit[]>(`/api/companies/${user.companyId}/units/map`),
        api.get<Incident[]>('/api/incidents?scope=company'),
        api.get<Technician[]>('/api/technicians'),
        api.get<Tool[]>('/api/tools'),
        api.get<License[]>('/api/licenses'),
        api.get<Vehicle[]>('/api/vehicles'),
        api.get<Component[]>('/api/components?scope=company'),
        api.get<Skill[]>('/api/skills'),
        api.get<IncidentType[]>('/api/incident-types'),
        api.get<DispatchRun[]>('/api/dispatch-runs')
      ])
    setUnits(unitsRes.data)
    setIncidents(incRes.data)
    setTechnicians(techRes.data)
    setTools(toolRes.data)
    setLicenses(licRes.data)
    setVehicles(vehRes.data)
    setComponents(compRes.data)
    setSkills(skillsRes.data)
    setIncidentTypes(typesRes.data)
    setDispatchRuns(runsRes.data)
    setIncidentPriorityEdits(Object.fromEntries(incRes.data.map((i) => [i._id, i.priority])))
    setIncidentModeREdits(Object.fromEntries(incRes.data.map((i) => [i._id, i.modeFeas?.R ?? false])))
    setIncidentModeOEdits(Object.fromEntries(incRes.data.map((i) => [i._id, i.modeFeas?.O ?? false])))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!stationLocation || routableIncidents.length === 0) return

    const requests = routableIncidents
      .map((inc) => {
        const unit = unitById.get(inc.unitId)
        if (!unit?.location) return null
        return { incidentId: inc._id, unit }
      })
      .filter(Boolean) as Array<{ incidentId: string; unit: Unit }>

    if (requests.length === 0) return

    const allCached = requests.every(({ unit }) =>
      routeCache.has(routeCacheKey(stationLocation.lat, stationLocation.lng, unit.location.lat, unit.location.lng))
    )
    if (allCached) {
      setRouteLines(Object.fromEntries(
        requests.map(({ incidentId, unit }) => [
          incidentId,
          routeCache.get(routeCacheKey(stationLocation.lat, stationLocation.lng, unit.location.lat, unit.location.lng))!
        ])
      ))
      return
    }

    let cancelled = false
    Promise.all(
      requests.map(({ incidentId, unit }) =>
        fetchOsrmRoute(
          stationLocation.lat, stationLocation.lng,
          unit.location.lat, unit.location.lng
        ).then((info) => [incidentId, info] as const)
      )
    ).then((entries) => {
      if (!cancelled) setRouteLines(Object.fromEntries(entries))
    })

    return () => { cancelled = true }
  }, [
    stationLocation?.lat, 
    stationLocation?.lng,
    routableKey
  ])

  const handleOptimize = async () => {
    setOptimizing(true)
    try {
      const res = await api.post<OptimizeResult>('/api/optimize/dispatch-now', {})
      setPreviewResult(res.data)
      setPreviewOpen(true)
    } finally {
      setOptimizing(false)
    }
  }

  const handleConfirmDispatch = async () => {
    setPreviewOpen(false)
    setResult(previewResult)
    await load()
  }

  const handleCancelPreview = async () => {
    setPreviewOpen(false)
    if (previewResult) {
      for (const a of previewResult.assignments) {
        try { await api.post(`/api/incidents/${a.incidentId}/cancel`) } catch { /* bỏ qua */ }
      }
    }
    setPreviewResult(null)
    await load()
  }

  const openAddTech = () => {
    setTechDialogMode('add'); setEditingTechId(null)
    const sLat = stationLocation?.lat != null ? String(stationLocation.lat) : ''
    const sLng = stationLocation?.lng != null ? String(stationLocation.lng) : ''
    const sAddr = stationLocation?.address ?? ''
    setTechForm({ name: '', skills: [], lat: sLat, lng: sLng, address: sAddr, availableNow: true, dMatrixRows: [] })
    setTechDialogOpen(true)
  }

  const openEditTech = (tech: Technician) => {
    setTechDialogMode('edit'); setEditingTechId(tech._id)
    const sLat = stationLocation?.lat != null ? String(stationLocation.lat) : ''
    const sLng = stationLocation?.lng != null ? String(stationLocation.lng) : ''
    const sAddr = stationLocation?.address ?? ''
    setTechForm({
      name: tech.name ?? '', skills: tech.skills ?? [],
      lat: sLat || (tech.homeLocation?.lat != null ? String(tech.homeLocation.lat) : ''),
      lng: sLng || (tech.homeLocation?.lng != null ? String(tech.homeLocation.lng) : ''),
      address: sAddr || tech.homeLocation?.address || '',
      availableNow: Boolean(tech.availableNow),
      dMatrixRows: (tech.dMatrix || []).map((entry) => ({
        typeCode: entry.typeCode, mode: entry.mode as 'R' | 'O', durationHours: String(entry.durationHours)
      }))
    })
    setTechDialogOpen(true)
  }

  const handleSubmitTech = async () => {
    if (!stationLocation) return
    const dMatrix = techForm.dMatrixRows
      .filter((row) => row.typeCode && row.durationHours !== '')
      .map((row) => ({ typeCode: row.typeCode, mode: row.mode, durationHours: Number(row.durationHours) }))
    const payload = {
      name: techForm.name, skills: techForm.skills, availableNow: techForm.availableNow,
      homeLocation: { lat: stationLocation.lat, lng: stationLocation.lng, address: stationLocation.address },
      dMatrix
    }
    if (techDialogMode === 'add') await api.post('/api/technicians', payload)
    else if (editingTechId) await api.patch(`/api/technicians/${editingTechId}`, payload)
    setTechDialogOpen(false); await load()
  }

  const handleDeleteTech = async (id: string) => { await api.delete(`/api/technicians/${id}`); await load() }

  const openAddTool = () => {
    setToolDialogMode('add'); setEditingToolId(null)
    setToolForm({ name: '', typeCode: '', availableQty: 1 }); setToolDialogOpen(true)
  }
  const openEditTool = (t: Tool) => {
    setToolDialogMode('edit'); setEditingToolId(t._id)
    setToolForm({ name: t.name, typeCode: t.typeCode, availableQty: t.availableQty }); setToolDialogOpen(true)
  }
  const handleSubmitTool = async () => {
    const payload = { name: toolForm.name, typeCode: toolForm.typeCode, availableQty: Number(toolForm.availableQty) }
    if (toolDialogMode === 'add') await api.post('/api/tools', payload)
    else if (editingToolId) await api.patch(`/api/tools/${editingToolId}`, payload)
    setToolDialogOpen(false); await load()
  }
  const handleDeleteTool = async (id: string) => { await api.delete(`/api/tools/${id}`); await load() }

  const openAddLicense = () => {
    setLicenseDialogMode('add'); setEditingLicenseId(null)
    setLicenseForm({ name: '', typeCode: '', capTotal: 1, inUseNow: 0 }); setLicenseDialogOpen(true)
  }
  const openEditLicense = (l: License) => {
    setLicenseDialogMode('edit'); setEditingLicenseId(l._id)
    setLicenseForm({ name: l.name, typeCode: l.typeCode, capTotal: l.capTotal, inUseNow: l.inUseNow })
    setLicenseDialogOpen(true)
  }
  const handleSubmitLicense = async () => {
    const payload = { name: licenseForm.name, typeCode: licenseForm.typeCode, capTotal: Number(licenseForm.capTotal), inUseNow: Number(licenseForm.inUseNow) }
    if (licenseDialogMode === 'add') await api.post('/api/licenses', payload)
    else if (editingLicenseId) await api.patch(`/api/licenses/${editingLicenseId}`, payload)
    setLicenseDialogOpen(false); await load()
  }
  const handleDeleteLicense = async (id: string) => { await api.delete(`/api/licenses/${id}`); await load() }

  const openAddVehicle = () => {
    setVehicleDialogMode('add'); setEditingVehicleId(null)
    setVehicleForm({ availableQty: 1 }); setVehicleDialogOpen(true)
  }
  const openEditVehicle = (v: Vehicle) => {
    setVehicleDialogMode('edit'); setEditingVehicleId(v._id)
    setVehicleForm({ availableQty: v.availableQty }); setVehicleDialogOpen(true)
  }
  const handleSubmitVehicle = async () => {
    const payload = { availableQty: Number(vehicleForm.availableQty) }
    if (vehicleDialogMode === 'add') await api.post('/api/vehicles', payload)
    else if (editingVehicleId) await api.patch(`/api/vehicles/${editingVehicleId}`, payload)
    setVehicleDialogOpen(false); await load()
  }
  const handleDeleteVehicle = async (id: string) => { await api.delete(`/api/vehicles/${id}`); await load() }

  const handleSaveIncidentConfig = async (incidentId: string) => {
    await api.patch(`/api/incidents/${incidentId}`, {
      priority: Number(incidentPriorityEdits[incidentId] ?? 1),
      modeFeas: { R: Boolean(incidentModeREdits[incidentId]), O: Boolean(incidentModeOEdits[incidentId]) }
    })
    await load()
  }

  const openRequirementsDialog = (incident: Incident) => {
    const req = incident.requirements || { requiredSkills: [], requiredToolsByMode: { R: [], O: [] }, requiredLicensesByMode: { R: [], O: [] }, requiresVehicleIfOnsite: false }
    setRequirementsIncidentId(incident._id)
    setRequirementsForm({
      requiredSkills: req.requiredSkills || [], toolsR: req.requiredToolsByMode?.R || [],
      toolsO: req.requiredToolsByMode?.O || [], licensesR: req.requiredLicensesByMode?.R || [],
      licensesO: req.requiredLicensesByMode?.O || [], requiresVehicleIfOnsite: Boolean(req.requiresVehicleIfOnsite)
    })
    setRequirementsDialogOpen(true)
  }

  const handleSaveRequirements = async () => {
    if (!requirementsIncidentId) return
    await api.patch(`/api/incidents/${requirementsIncidentId}`, {
      requirements: {
        requiredSkills: requirementsForm.requiredSkills,
        requiredToolsByMode: { R: requirementsForm.toolsR, O: requirementsForm.toolsO },
        requiredLicensesByMode: { R: requirementsForm.licensesR, O: requirementsForm.licensesO },
        requiresVehicleIfOnsite: requirementsForm.requiresVehicleIfOnsite
      }
    })
    setRequirementsDialogOpen(false); await load()
  }

  const handleCancelDispatch = async (id: string) => { await api.post(`/api/incidents/${id}/cancel`); await load() }
  const toggleIncidentExpand = (id: string) => setExpandedIncidents((p) => ({ ...p, [id]: !p[id] }))
  const toggleRunExpand = (id: string) => setExpandedRuns((p) => ({ ...p, [id]: !p[id] }))

  const openAddUnit = () => {
    setUnitDialogMode('add'); setEditingUnitId(null)
    setUnitForm({ name: '', address: '', lat: '', lng: '', remoteAccessReady: false, isSupportStation: false })
    setUnitDialogOpen(true)
  }
  const openEditUnit = (u: Unit) => {
    setUnitDialogMode('edit'); setEditingUnitId(u._id)
    setUnitForm({
      name: u.name ?? '', address: u.location?.address ?? '',
      lat: u.location?.lat != null ? String(u.location.lat) : '',
      lng: u.location?.lng != null ? String(u.location.lng) : '',
      remoteAccessReady: Boolean(u.remoteAccessReady), isSupportStation: Boolean(u.isSupportStation)
    })
    setUnitDialogOpen(true)
  }
  const handleSubmitUnit = async () => {
    const lat = Number(unitForm.lat); const lng = Number(unitForm.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return
    if (unitForm.isSupportStation && existingStation && existingStation._id !== editingUnitId) return
    const payload = { name: unitForm.name, location: { lat, lng, address: unitForm.address }, remoteAccessReady: unitForm.remoteAccessReady, isSupportStation: unitForm.isSupportStation }
    if (unitDialogMode === 'add') await api.post(`/api/companies/${user.companyId}/units`, payload)
    else if (editingUnitId) await api.patch(`/api/companies/${user.companyId}/units/${editingUnitId}`, payload)
    setUnitDialogOpen(false); await load()
  }
  const handleDeleteUnit = async (id: string) => { await api.delete(`/api/companies/${user.companyId}/units/${id}`); await load() }

  const handleSubmitSkill = async () => {
    if (!skillForm.name.trim()) return
    if (skillDialogMode === 'add') await api.post('/api/skills', { name: skillForm.name.trim() })
    else if (editingSkillId) await api.patch(`/api/skills/${editingSkillId}`, { name: skillForm.name.trim() })
    setSkillDialogOpen(false); await load()
  }

  const parseList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean)

  const handleSubmitIncidentType = async () => {
    const payload = {
      code: incidentTypeForm.code, name: incidentTypeForm.name,
      defaultPriority: Number(incidentTypeForm.defaultPriority),
      defaultSetupRemote: Number(incidentTypeForm.defaultSetupRemote),
      defaultFeasRemote: Boolean(incidentTypeForm.defaultFeasRemote),
      defaultFeasOnsite: Boolean(incidentTypeForm.defaultFeasOnsite),
      requirements: {
        requiredSkills: incidentTypeForm.requiredSkills,
        requiredToolsByMode: { R: parseList(incidentTypeForm.toolsR), O: parseList(incidentTypeForm.toolsO) },
        requiredLicensesByMode: { R: parseList(incidentTypeForm.licensesR), O: parseList(incidentTypeForm.licensesO) },
        requiresVehicleIfOnsite: Boolean(incidentTypeForm.requiresVehicleIfOnsite)
      }
    }
    if (incidentTypeDialogMode === 'add') await api.post('/api/incident-types', payload)
    else if (editingIncidentTypeId) await api.patch(`/api/incident-types/${editingIncidentTypeId}`, {
      name: payload.name, defaultPriority: payload.defaultPriority, defaultSetupRemote: payload.defaultSetupRemote,
      defaultFeasRemote: payload.defaultFeasRemote, defaultFeasOnsite: payload.defaultFeasOnsite, requirements: payload.requirements
    })
    setIncidentTypeDialogOpen(false); await load()
  }

  const selectedRouteIncident = selectedRouteId ? routableIncidents.find((i) => i._id === selectedRouteId) : null
  const selectedRouteInfo = selectedRouteId ? (routeLines[selectedRouteId] ?? fallbackLines[selectedRouteId]) : null
  const mapDefault = getSavedMapState() ?? { center: [16.0, 106.0] as [number, number], zoom: 5 }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight="bold">Bảng điều khiển doanh nghiệp</Typography>
      <Tabs value={mainTab} onChange={(_, v) => setMainTab(v)}>
        <Tab label="Điều phối" />
        <Tab label="Quản trị" />
      </Tabs>

      {mainTab === 0 && (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Sự cố đang xử lý</Typography>
                <Typography variant="caption" color="text.secondary">
                  Hiển thị {Math.min(activeIncidents.length, incidentRowsPerPage)} / {activeIncidents.length}
                </Typography>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>Loại sự cố</TableCell>
                    <TableCell>Thiết bị</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell>Ưu tiên</TableCell>
                    <TableCell>Đơn vị</TableCell>
                    <TableCell>Khả thi (TX/TC)</TableCell>
                    <TableCell>Thời điểm</TableCell>
                    <TableCell>Yêu cầu</TableCell>
                    <TableCell>Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedIncidents.map((inc) => {
                    const isEditable = inc.status === 'OPEN'
                    const isExpandable = Boolean(inc.dispatch)
                    return (
                      <Fragment key={inc._id}>
                        <TableRow>
                          <TableCell>
                            <IconButton size="small" onClick={() => toggleIncidentExpand(inc._id)} disabled={!isExpandable}>
                              {expandedIncidents[inc._id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                            </IconButton>
                          </TableCell>
                          <TableCell>{inc.typeCode}</TableCell>
                          <TableCell>{componentNameById.get(inc.componentId) || inc.componentId || '–'}</TableCell>
                          <TableCell>{statusLabel(inc.status)}</TableCell>
                          <TableCell>
                            <TextField type="number" size="small" value={incidentPriorityEdits[inc._id] ?? inc.priority}
                              onChange={(e) => setIncidentPriorityEdits((p) => ({ ...p, [inc._id]: Number(e.target.value) }))}
                              disabled={!isEditable} sx={{ width: 90 }} />
                          </TableCell>
                          <TableCell>{unitNameById.get(inc.unitId) || inc.unitId}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <FormControlLabel control={
                                <Switch checked={incidentModeREdits[inc._id] ?? inc.modeFeas.R}
                                  onChange={(e) => setIncidentModeREdits((p) => ({ ...p, [inc._id]: e.target.checked }))}
                                  disabled={!isEditable} size="small" />} label="Từ xa" />
                              <FormControlLabel control={
                                <Switch checked={incidentModeOEdits[inc._id] ?? inc.modeFeas.O}
                                  onChange={(e) => setIncidentModeOEdits((p) => ({ ...p, [inc._id]: e.target.checked }))}
                                  disabled={!isEditable} size="small" />} label="Tại chỗ" />
                            </Stack>
                          </TableCell>
                          <TableCell>{new Date(inc.reportedAt).toLocaleString('vi-VN')}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Kỹ năng: {inc.requirements?.requiredSkills?.length ?? 0} | Công cụ (TX/TC):&nbsp;
                              {inc.requirements?.requiredToolsByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredToolsByMode?.O?.length ?? 0} | PM (TX/TC):&nbsp;
                              {inc.requirements?.requiredLicensesByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredLicensesByMode?.O?.length ?? 0} | PT:&nbsp;
                              {inc.requirements?.requiresVehicleIfOnsite ? 'Có' : 'Không'}
                            </Typography>
                            <Button size="small" onClick={() => openRequirementsDialog(inc)}>Chỉnh sửa</Button>
                          </TableCell>
                          <TableCell>
                            {isEditable ? (
                              <Button size="small" onClick={() => handleSaveIncidentConfig(inc._id)}>Lưu</Button>
                            ) : (inc.status === 'DISPATCHED' || inc.status === 'IN_PROGRESS') && (
                              <Button size="small" color="warning" onClick={() => handleCancelDispatch(inc._id)}>Huỷ</Button>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={10} sx={{ py: 0 }}>
                            <Collapse in={expandedIncidents[inc._id]} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2, backgroundColor: '#fafafa', borderRadius: 1 }}>
                                <Typography variant="subtitle2" gutterBottom>Nguồn lực đã điều phối</Typography>
                                {inc.dispatch ? (
                                  <Table size="small">
                                    <TableHead><TableRow>
                                      <TableCell>Kỹ thuật viên</TableCell><TableCell>Chế độ</TableCell>
                                      <TableCell>Công cụ</TableCell><TableCell>Phần mềm</TableCell>
                                      <TableCell>Phương tiện</TableCell><TableCell>TG dự kiến (h)</TableCell>
                                    </TableRow></TableHead>
                                    <TableBody><TableRow>
                                      <TableCell>{techNameById.get(inc.dispatch.assignedTechId) || inc.dispatch.assignedTechId}</TableCell>
                                      <TableCell>{inc.dispatch.mode === 'O' ? 'Tại chỗ' : 'Từ xa'}</TableCell>
                                      <TableCell>{inc.dispatch.allocatedTools.join(', ') || '–'}</TableCell>
                                      <TableCell>{inc.dispatch.allocatedLicenses.join(', ') || '–'}</TableCell>
                                      <TableCell>{inc.dispatch.vehicleAllocated ? 'Có' : '–'}</TableCell>
                                      <TableCell>{inc.dispatch.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                                    </TableRow></TableBody>
                                  </Table>
                                ) : <Typography variant="caption" color="text.secondary">Chưa có thông tin điều phối.</Typography>}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              <TablePagination component="div" count={activeIncidents.length} page={incidentPage}
                onPageChange={(_, p) => setIncidentPage(p)} rowsPerPage={incidentRowsPerPage} rowsPerPageOptions={[incidentRowsPerPage]}
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`} />
            </CardContent>
          </Card>

          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12} md={4}>
              <Stack spacing={2}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Nguồn lực</Typography>
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead><TableRow>
                          <TableCell>Danh mục</TableCell><TableCell>Tên</TableCell><TableCell>Mã</TableCell>
                          <TableCell align="right">Khả dụng</TableCell><TableCell align="right">Tổng</TableCell>
                        </TableRow></TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell>KTV</TableCell><TableCell>Sẵn sàng</TableCell><TableCell>–</TableCell>
                            <TableCell align="right">{availableTechs}</TableCell><TableCell align="right">{technicians.length}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Phương tiện</TableCell><TableCell>Xe</TableCell><TableCell>–</TableCell>
                            <TableCell align="right">{vehicleQty}</TableCell><TableCell align="right">{vehicleQty}</TableCell>
                          </TableRow>
                          {tools.map((t) => (
                            <TableRow key={t._id}>
                              <TableCell>Công cụ</TableCell><TableCell>{t.name}</TableCell><TableCell>{t.typeCode}</TableCell>
                              <TableCell align="right">{t.availableQty}</TableCell><TableCell align="right">–</TableCell>
                            </TableRow>
                          ))}
                          {licenses.map((l) => (
                            <TableRow key={l._id}>
                              <TableCell>Phần mềm</TableCell><TableCell>{l.name}</TableCell><TableCell>{l.typeCode}</TableCell>
                              <TableCell align="right">{l.capTotal - l.inUseNow}</TableCell><TableCell align="right">{l.capTotal}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                    <Button sx={{ mt: 2 }} variant="contained" onClick={handleOptimize} disabled={optimizing} fullWidth>
                      {optimizing ? 'Đang tối ưu...' : 'Tối ưu điều phối ngay'}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Thống kê sự cố</Typography>
                    <Stack spacing={1.5}>
                      {statusBuckets.map((b) => {
                        const count = statusCounts[b.key] ?? 0
                        return (
                          <Box key={b.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ width: 110 }}>{b.label}</Typography>
                            <Box sx={{ flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                              <Box sx={{ width: `${(count / maxStatusCount) * 100}%`, height: '100%', backgroundColor: b.color, borderRadius: 4 }} />
                            </Box>
                            <Typography variant="caption" sx={{ width: 20, textAlign: 'right' }}>{count}</Typography>
                          </Box>
                        )
                      })}
                    </Stack>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>Loại sự cố nổi bật</Typography>
                    <Stack spacing={1.5}>
                      {typeData.length === 0 && <Typography variant="caption" color="text.secondary">Chưa có dữ liệu.</Typography>}
                      {typeData.map(([tc, count]) => (
                        <Box key={tc} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" sx={{ width: 110 }}>{tc}</Typography>
                          <Box sx={{ flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                            <Box sx={{ width: `${(count / maxTypeCount) * 100}%`, height: '100%', backgroundColor: '#546e7a', borderRadius: 4 }} />
                          </Box>
                          <Typography variant="caption" sx={{ width: 20, textAlign: 'right' }}>{count}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>

            <Grid item xs={12} md={8}>
              <Card sx={{ height: { xs: 420, md: 'calc(100vh - 220px)' }, minHeight: 420 }}>
                <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="h6" gutterBottom>Bản đồ đơn vị</Typography>
                  <Box className="map-shell" sx={{ position: 'relative' }}>
                    <MapContainer center={mapDefault.center} zoom={mapDefault.zoom} style={{ height: '100%', width: '100%' }}>
                      <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
                      <MapStateTracker />
                      {stationLocation && routableIncidents.map((inc) => {
                        const unit = unitById.get(inc.unitId)
                        if (!unit?.location) return null
                        const info = routeLines[inc._id] ?? fallbackLines[inc._id]
                        if (!info) return null
                        const isSelected = selectedRouteId === inc._id
                        const dispatched = inc._routeType === 'dispatched'
                        return (
                          <Polyline key={`route-${inc._id}`} positions={info.coords}
                            pathOptions={{
                              color: isSelected ? '#ff9800' : dispatched ? '#1976d2' : '#d32f2f',
                              weight: isSelected ? 6 : dispatched ? 4 : 3,
                              dashArray: dispatched ? undefined : '8,6',
                              opacity: isSelected ? 1 : dispatched ? 0.9 : 0.6
                            }}
                            eventHandlers={{ click: () => setSelectedRouteId(inc._id) }}>
                            <Tooltip sticky>
                              {dispatched ? `Đã điều phối: ${inc.typeCode}` : `Chưa điều phối: ${inc.typeCode}`} — {unit.name}
                            </Tooltip>
                          </Polyline>
                        )
                      })}
                      {units.map((unit) => (
                        <Fragment key={unit._id}>
                          {unit.activeIncidents && unit.activeIncidents > 0 && (
                            <Marker position={[unit.location.lat, unit.location.lng]} icon={pulseIcon} interactive={false} />
                          )}
                          <Marker position={[unit.location.lat, unit.location.lng]}
                            icon={unit.isSupportStation ? supportStationIcon : DefaultIcon}>
                            <Tooltip direction="top" offset={[0, -18]} permanent className="unit-label-tooltip">{unit.name}</Tooltip>
                            <Popup>
                              <Typography variant="subtitle2">{unit.name}</Typography>
                              <Typography variant="caption">Sự cố: {unit.activeIncidents ?? 0}</Typography>
                            </Popup>
                          </Marker>
                        </Fragment>
                      ))}
                    </MapContainer>

                    {selectedRouteIncident && selectedRouteInfo && (
                      <Box sx={{
                        position: 'absolute', top: 10, left: 10, zIndex: 1000,
                        backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 2, p: 2,
                        minWidth: 240, maxWidth: 320, boxShadow: 3
                      }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle2">Thông tin tuyến đường</Typography>
                          <IconButton size="small" onClick={() => setSelectedRouteId(null)}>✕</IconButton>
                        </Stack>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="body2">Sự cố: {selectedRouteIncident.typeCode}</Typography>
                        <Typography variant="body2">Đơn vị: {unitNameById.get(selectedRouteIncident.unitId) || selectedRouteIncident.unitId}</Typography>
                        <Typography variant="body2">Trạng thái: {selectedRouteIncident._routeType === 'dispatched' ? 'Đã điều phối' : 'Chưa điều phối'}</Typography>
                        <Typography variant="body2">Khoảng cách: {fmtDistance(selectedRouteInfo.distance)}</Typography>
                        <Typography variant="body2">Thời gian: {fmtDuration(selectedRouteInfo.duration)}</Typography>
                        {selectedRouteIncident.dispatch && (
                          <>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="body2">KTV: {techNameById.get(selectedRouteIncident.dispatch.assignedTechId) || selectedRouteIncident.dispatch.assignedTechId}</Typography>
                            <Typography variant="body2">Chế độ: {selectedRouteIncident.dispatch.mode === 'O' ? 'Tại chỗ' : 'Từ xa'}</Typography>
                            <Typography variant="body2">TG phục hồi: {selectedRouteIncident.dispatch.timeToRestoreEstimateHours.toFixed(2)}h</Typography>
                          </>
                        )}
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Lịch sử điều phối</Typography>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell /><TableCell>Thời điểm</TableCell><TableCell>Số phân công</TableCell><TableCell>Mục tiêu</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {dispatchRuns.map((run) => (
                    <Fragment key={run._id}>
                      <TableRow>
                        <TableCell>
                          <IconButton size="small" onClick={() => toggleRunExpand(run._id)}>
                            {expandedRuns[run._id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                          </IconButton>
                        </TableCell>
                        <TableCell>{new Date(run.createdAt).toLocaleString('vi-VN')}</TableCell>
                        <TableCell>{run.result.assignments.length}</TableCell>
                        <TableCell>Z1={run.result.objectives.Z1} | Z2={run.result.objectives.Z2} | Z3={run.result.objectives.Z3}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} sx={{ py: 0 }}>
                          <Collapse in={expandedRuns[run._id]} timeout="auto" unmountOnExit>
                            <Box sx={{ p: 2, backgroundColor: '#fafafa', borderRadius: 1 }}>
                              <Table size="small">
                                <TableHead><TableRow>
                                  <TableCell>Sự cố</TableCell><TableCell>Kỹ thuật viên</TableCell>
                                  <TableCell>Chế độ</TableCell><TableCell>TG dự kiến (h)</TableCell>
                                </TableRow></TableHead>
                                <TableBody>
                                  {run.result.assignments.map((a, i) => (
                                    <TableRow key={i}>
                                      <TableCell>{incidentById.get(a.incidentId)?.typeCode ?? a.incidentId}</TableCell>
                                      <TableCell>{techNameById.get(a.technicianId) ?? a.technicianId}</TableCell>
                                      <TableCell>{a.mode === 'O' ? 'Tại chỗ' : 'Từ xa'}</TableCell>
                                      <TableCell>{a.timeToRestoreEstimateHours?.toFixed(2) ?? '--'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Stack>
      )}

      {mainTab === 1 && (
        <Stack spacing={2}>
          <Tabs value={manageTab} onChange={(_, v) => setManageTab(v)} variant="scrollable">
            <Tab label="Đơn vị" />
            <Tab label="Kỹ thuật viên" />
            <Tab label="Công cụ" />
            <Tab label="Phần mềm" />
            <Tab label="Phương tiện" />
            <Tab label="Kỹ năng" />
            <Tab label="Loại sự cố" />
          </Tabs>

          {manageTab === 0 && (
            <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Đơn vị</Typography>
                <Button variant="outlined" size="small" onClick={openAddUnit}>Thêm</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Tên</TableCell><TableCell>Địa chỉ</TableCell><TableCell>Toạ độ</TableCell>
                  <TableCell>Truy cập từ xa</TableCell><TableCell>Trạm ứng cứu</TableCell><TableCell>Thao tác</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {units.map((u) => (
                    <TableRow key={u._id}>
                      <TableCell>{u.name}</TableCell><TableCell>{u.location?.address}</TableCell>
                      <TableCell>{u.location?.lat?.toFixed(4)}, {u.location?.lng?.toFixed(4)}</TableCell>
                      <TableCell>{u.remoteAccessReady ? 'Có' : '–'}</TableCell>
                      <TableCell>{u.isSupportStation ? 'Có' : ''}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => openEditUnit(u)}>Sửa</Button>
                        <Button size="small" color="error" onClick={() => handleDeleteUnit(u._id)}>Xoá</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {manageTab === 1 && (
            <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Kỹ thuật viên</Typography>
                <Button variant="outlined" size="small" onClick={openAddTech}>Thêm</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Tên</TableCell><TableCell>Kỹ năng</TableCell><TableCell>Sẵn sàng</TableCell><TableCell>Thao tác</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {technicians.map((t) => (
                    <TableRow key={t._id}>
                      <TableCell>{t.name}</TableCell><TableCell>{t.skills?.join(', ')}</TableCell>
                      <TableCell>{t.availableNow ? 'Có' : '–'}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => openEditTech(t)}>Sửa</Button>
                        <Button size="small" color="error" onClick={() => handleDeleteTech(t._id)}>Xoá</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {manageTab === 2 && (
            <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Công cụ</Typography>
                <Button variant="outlined" size="small" onClick={openAddTool}>Thêm</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow><TableCell>Tên</TableCell><TableCell>Mã</TableCell><TableCell>Số lượng</TableCell><TableCell>Thao tác</TableCell></TableRow></TableHead>
                <TableBody>
                  {tools.map((t) => (
                    <TableRow key={t._id}>
                      <TableCell>{t.name}</TableCell><TableCell>{t.typeCode}</TableCell><TableCell>{t.availableQty}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => openEditTool(t)}>Sửa</Button>
                        <Button size="small" color="error" onClick={() => handleDeleteTool(t._id)}>Xoá</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {manageTab === 3 && (
            <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Phần mềm / Bản quyền</Typography>
                <Button variant="outlined" size="small" onClick={openAddLicense}>Thêm</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Tên</TableCell><TableCell>Mã</TableCell><TableCell>Tổng</TableCell><TableCell>Đang dùng</TableCell><TableCell>Thao tác</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {licenses.map((l) => (
                    <TableRow key={l._id}>
                      <TableCell>{l.name}</TableCell><TableCell>{l.typeCode}</TableCell>
                      <TableCell>{l.capTotal}</TableCell><TableCell>{l.inUseNow}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => openEditLicense(l)}>Sửa</Button>
                        <Button size="small" color="error" onClick={() => handleDeleteLicense(l._id)}>Xoá</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {manageTab === 4 && (
            <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Phương tiện</Typography>
                <Button variant="outlined" size="small" onClick={openAddVehicle}>Thêm</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow><TableCell>Số lượng</TableCell><TableCell>Thao tác</TableCell></TableRow></TableHead>
                <TableBody>
                  {vehicles.map((v) => (
                    <TableRow key={v._id}>
                      <TableCell>{v.availableQty}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => openEditVehicle(v)}>Sửa</Button>
                        <Button size="small" color="error" onClick={() => handleDeleteVehicle(v._id)}>Xoá</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {manageTab === 5 && (
            <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Kỹ năng</Typography>
                <Button variant="outlined" size="small" onClick={() => {
                  setSkillDialogMode('add'); setEditingSkillId(null); setSkillForm({ name: '' }); setSkillDialogOpen(true)
                }}>Thêm</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow><TableCell>Tên</TableCell><TableCell>Thao tác</TableCell></TableRow></TableHead>
                <TableBody>
                  {skills.map((s) => (
                    <TableRow key={s._id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => {
                          setSkillDialogMode('edit'); setEditingSkillId(s._id); setSkillForm({ name: s.name }); setSkillDialogOpen(true)
                        }}>Sửa</Button>
                        <Button size="small" color="error" onClick={async () => { await api.delete(`/api/skills/${s._id}`); await load() }}>Xoá</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}

          {manageTab === 6 && (
            <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Loại sự cố</Typography>
                <Button variant="outlined" size="small" onClick={() => {
                  setIncidentTypeDialogMode('add'); setEditingIncidentTypeId(null)
                  setIncidentTypeForm({ code: '', name: '', defaultPriority: 3, defaultSetupRemote: 0.5, defaultFeasRemote: true, defaultFeasOnsite: true, requiredSkills: [], toolsR: '', toolsO: '', licensesR: '', licensesO: '', requiresVehicleIfOnsite: false })
                  setIncidentTypeDialogOpen(true)
                }}>Thêm</Button>
              </Stack>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Mã</TableCell><TableCell>Tên</TableCell><TableCell>Ưu tiên</TableCell>
                  <TableCell>Từ xa</TableCell><TableCell>Tại chỗ</TableCell><TableCell>Thao tác</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {incidentTypes.map((it) => (
                    <TableRow key={it._id}>
                      <TableCell>{it.code}</TableCell><TableCell>{it.name}</TableCell><TableCell>{it.defaultPriority}</TableCell>
                      <TableCell>{it.defaultFeasRemote ? 'Có' : '–'}</TableCell><TableCell>{it.defaultFeasOnsite ? 'Có' : '–'}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => {
                          setIncidentTypeDialogMode('edit'); setEditingIncidentTypeId(it._id)
                          setIncidentTypeForm({
                            code: it.code, name: it.name, defaultPriority: it.defaultPriority,
                            defaultSetupRemote: it.defaultSetupRemote ?? 0.5,
                            defaultFeasRemote: it.defaultFeasRemote, defaultFeasOnsite: it.defaultFeasOnsite,
                            requiredSkills: it.requirements?.requiredSkills ?? [],
                            toolsR: it.requirements?.requiredToolsByMode?.R?.join(', ') ?? '',
                            toolsO: it.requirements?.requiredToolsByMode?.O?.join(', ') ?? '',
                            licensesR: it.requirements?.requiredLicensesByMode?.R?.join(', ') ?? '',
                            licensesO: it.requirements?.requiredLicensesByMode?.O?.join(', ') ?? '',
                            requiresVehicleIfOnsite: Boolean(it.requirements?.requiresVehicleIfOnsite)
                          })
                          setIncidentTypeDialogOpen(true)
                        }}>Sửa</Button>
                        <Button size="small" color="error" onClick={async () => { await api.delete(`/api/incident-types/${it._id}`); await load() }}>Xoá</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </Stack>
      )}

      {/* Dialog xem trước kết quả tối ưu */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Xem trước kết quả tối ưu hoá</DialogTitle>
        <DialogContent>
          {previewResult && (
            <>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Z1={previewResult.objectives.Z1} | Z2={previewResult.objectives.Z2} | Z3={previewResult.objectives.Z3}
              </Typography>
              {previewResult.assignments.length > 0 ? (
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>Sự cố</TableCell><TableCell>Đơn vị</TableCell><TableCell>Kỹ thuật viên</TableCell>
                    <TableCell>Chế độ</TableCell><TableCell>Công cụ</TableCell><TableCell>Phần mềm</TableCell>
                    <TableCell>Phương tiện</TableCell><TableCell>TG dự kiến (h)</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {previewResult.assignments.map((a, i) => {
                      const inc = incidentById.get(a.incidentId)
                      return (
                        <TableRow key={i}>
                          <TableCell>{inc?.typeCode ?? a.incidentId}</TableCell>
                          <TableCell>{inc ? (unitNameById.get(inc.unitId) || inc.unitId) : '--'}</TableCell>
                          <TableCell>{techNameById.get(a.technicianId) ?? a.technicianId}</TableCell>
                          <TableCell>{a.mode === 'O' ? 'Tại chỗ' : 'Từ xa'}</TableCell>
                          <TableCell>{a.allocatedTools?.join(', ') || '–'}</TableCell>
                          <TableCell>{a.allocatedLicenses?.join(', ') || '–'}</TableCell>
                          <TableCell>{a.vehicleAllocated ? 'Có' : '–'}</TableCell>
                          <TableCell>{a.timeToRestoreEstimateHours?.toFixed(2) ?? '--'}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : <Typography variant="body2" color="text.secondary">Không có phân công nào.</Typography>}
              {previewResult.unassigned && previewResult.unassigned.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2">Chưa phân công được:</Typography>
                  {previewResult.unassigned.map((u) => (
                    <Typography key={u.incidentId} variant="body2">
                      {u.typeCode} (UT:{u.priority}): {u.reasons.join(', ')}
                    </Typography>
                  ))}
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelPreview} color="error">Huỷ bỏ</Button>
          <Button onClick={handleConfirmDispatch} variant="contained">Xác nhận điều phối</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog thêm / sửa đơn vị */}
      <Dialog open={unitDialogOpen} onClose={() => setUnitDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{unitDialogMode === 'add' ? 'Thêm đơn vị' : 'Sửa đơn vị'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Tên đơn vị" fullWidth value={unitForm.name} onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField label="Địa chỉ" fullWidth value={unitForm.address} onChange={(e) => setUnitForm((f) => ({ ...f, address: e.target.value }))} />
            <Stack direction="row" spacing={2}>
              <TextField label="Vĩ độ (Lat)" value={unitForm.lat} onChange={(e) => setUnitForm((f) => ({ ...f, lat: e.target.value }))} />
              <TextField label="Kinh độ (Lng)" value={unitForm.lng} onChange={(e) => setUnitForm((f) => ({ ...f, lng: e.target.value }))} />
            </Stack>
            <UnitLocationPicker lat={unitForm.lat ? Number(unitForm.lat) : null} lng={unitForm.lng ? Number(unitForm.lng) : null}
              onChange={(lat, lng) => setUnitForm((f) => ({ ...f, lat: String(lat), lng: String(lng) }))} />
            <FormControlLabel control={<Switch checked={unitForm.remoteAccessReady} onChange={(e) => setUnitForm((f) => ({ ...f, remoteAccessReady: e.target.checked }))} />} label="Cho phép truy cập từ xa" />
            <FormControlLabel control={<Switch checked={unitForm.isSupportStation} onChange={(e) => setUnitForm((f) => ({ ...f, isSupportStation: e.target.checked }))} disabled={stationLocked} />} label="Là trạm ứng cứu" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnitDialogOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitUnit}>Lưu</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog thêm / sửa kỹ thuật viên */}
      <Dialog open={techDialogOpen} onClose={() => setTechDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{techDialogMode === 'add' ? 'Thêm kỹ thuật viên' : 'Sửa kỹ thuật viên'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Tên" fullWidth value={techForm.name} onChange={(e) => setTechForm((f) => ({ ...f, name: e.target.value }))} />
            <FormControl fullWidth>
              <InputLabel>Kỹ năng</InputLabel>
              <Select multiple value={techForm.skills} onChange={(e) => setTechForm((f) => ({ ...f, skills: e.target.value as string[] }))}
                renderValue={(sel) => sel.join(', ')}>
                {skills.map((s) => (
                  <MenuItem key={s._id} value={s.name}><Checkbox checked={techForm.skills.includes(s.name)} /><ListItemText primary={s.name} /></MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel control={<Switch checked={techForm.availableNow} onChange={(e) => setTechForm((f) => ({ ...f, availableNow: e.target.checked }))} />} label="Sẵn sàng nhận nhiệm vụ" />
            <Typography variant="subtitle2">Bảng thời gian xử lý (dMatrix)</Typography>
            {techForm.dMatrixRows.map((row, idx) => (
              <Stack key={idx} direction="row" spacing={1} alignItems="center">
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel>Loại SC</InputLabel>
                  <Select value={row.typeCode} onChange={(e) => {
                    const r = [...techForm.dMatrixRows]; r[idx] = { ...r[idx], typeCode: e.target.value as string }; setTechForm((f) => ({ ...f, dMatrixRows: r }))
                  }}>{incidentTypes.map((it) => <MenuItem key={it._id} value={it.code}>{it.code}</MenuItem>)}</Select>
                </FormControl>
                <FormControl sx={{ minWidth: 100 }}>
                  <InputLabel>Chế độ</InputLabel>
                  <Select value={row.mode} onChange={(e) => {
                    const r = [...techForm.dMatrixRows]; r[idx] = { ...r[idx], mode: e.target.value as 'R' | 'O' }; setTechForm((f) => ({ ...f, dMatrixRows: r }))
                  }}><MenuItem value="R">Từ xa</MenuItem><MenuItem value="O">Tại chỗ</MenuItem></Select>
                </FormControl>
                <TextField label="Giờ (h)" type="number" value={row.durationHours} onChange={(e) => {
                  const r = [...techForm.dMatrixRows]; r[idx] = { ...r[idx], durationHours: e.target.value }; setTechForm((f) => ({ ...f, dMatrixRows: r }))
                }} sx={{ width: 90 }} />
                <Button size="small" color="error" onClick={() => {
                  setTechForm((f) => ({ ...f, dMatrixRows: f.dMatrixRows.filter((_, i) => i !== idx) }))
                }}>Xoá</Button>
              </Stack>
            ))}
            <Button size="small" onClick={() => setTechForm((f) => ({ ...f, dMatrixRows: [...f.dMatrixRows, { typeCode: '', mode: 'R', durationHours: '' }] }))}>+ Thêm dòng</Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTechDialogOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={handleSubmitTech}>Lưu</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog thêm / sửa công cụ */}
      <Dialog open={toolDialogOpen} onClose={() => setToolDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{toolDialogMode === 'add' ? 'Thêm công cụ' : 'Sửa công cụ'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Tên" fullWidth value={toolForm.name} onChange={(e) => setToolForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField label="Mã" fullWidth value={toolForm.typeCode} onChange={(e) => setToolForm((f) => ({ ...f, typeCode: e.target.value }))} />
            <TextField label="Số lượng" type="number" fullWidth value={toolForm.availableQty} onChange={(e) => setToolForm((f) => ({ ...f, availableQty: Number(e.target.value) }))} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setToolDialogOpen(false)}>Huỷ</Button><Button variant="contained" onClick={handleSubmitTool}>Lưu</Button></DialogActions>
      </Dialog>

      {/* Dialog thêm / sửa phần mềm */}
      <Dialog open={licenseDialogOpen} onClose={() => setLicenseDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{licenseDialogMode === 'add' ? 'Thêm phần mềm' : 'Sửa phần mềm'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Tên" fullWidth value={licenseForm.name} onChange={(e) => setLicenseForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField label="Mã" fullWidth value={licenseForm.typeCode} onChange={(e) => setLicenseForm((f) => ({ ...f, typeCode: e.target.value }))} />
            <TextField label="Tổng số" type="number" fullWidth value={licenseForm.capTotal} onChange={(e) => setLicenseForm((f) => ({ ...f, capTotal: Number(e.target.value) }))} />
            <TextField label="Đang sử dụng" type="number" fullWidth value={licenseForm.inUseNow} onChange={(e) => setLicenseForm((f) => ({ ...f, inUseNow: Number(e.target.value) }))} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setLicenseDialogOpen(false)}>Huỷ</Button><Button variant="contained" onClick={handleSubmitLicense}>Lưu</Button></DialogActions>
      </Dialog>

      {/* Dialog thêm / sửa phương tiện */}
      <Dialog open={vehicleDialogOpen} onClose={() => setVehicleDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{vehicleDialogMode === 'add' ? 'Thêm phương tiện' : 'Sửa phương tiện'}</DialogTitle>
        <DialogContent>
          <TextField label="Số lượng" type="number" fullWidth value={vehicleForm.availableQty} onChange={(e) => setVehicleForm((f) => ({ ...f, availableQty: Number(e.target.value) }))} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setVehicleDialogOpen(false)}>Huỷ</Button><Button variant="contained" onClick={handleSubmitVehicle}>Lưu</Button></DialogActions>
      </Dialog>

      {/* Dialog thêm / sửa kỹ năng */}
      <Dialog open={skillDialogOpen} onClose={() => setSkillDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{skillDialogMode === 'add' ? 'Thêm kỹ năng' : 'Sửa kỹ năng'}</DialogTitle>
        <DialogContent>
          <TextField label="Tên kỹ năng" fullWidth value={skillForm.name} onChange={(e) => setSkillForm({ name: e.target.value })} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setSkillDialogOpen(false)}>Huỷ</Button><Button variant="contained" onClick={handleSubmitSkill}>Lưu</Button></DialogActions>
      </Dialog>

      {/* Dialog thêm / sửa loại sự cố */}
      <Dialog open={incidentTypeDialogOpen} onClose={() => setIncidentTypeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{incidentTypeDialogMode === 'add' ? 'Thêm loại sự cố' : 'Sửa loại sự cố'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Mã" fullWidth value={incidentTypeForm.code} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, code: e.target.value }))} disabled={incidentTypeDialogMode === 'edit'} />
            <TextField label="Tên" fullWidth value={incidentTypeForm.name} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField label="Độ ưu tiên mặc định" type="number" fullWidth value={incidentTypeForm.defaultPriority} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultPriority: Number(e.target.value) }))} />
            <TextField label="Thời gian setup từ xa (h)" type="number" fullWidth value={incidentTypeForm.defaultSetupRemote} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultSetupRemote: Number(e.target.value) }))} />
            <FormControlLabel control={<Switch checked={incidentTypeForm.defaultFeasRemote} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultFeasRemote: e.target.checked }))} />} label="Có thể xử lý từ xa" />
            <FormControlLabel control={<Switch checked={incidentTypeForm.defaultFeasOnsite} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, defaultFeasOnsite: e.target.checked }))} />} label="Có thể xử lý tại chỗ" />
            <FormControl fullWidth>
              <InputLabel>Kỹ năng yêu cầu</InputLabel>
              <Select multiple value={incidentTypeForm.requiredSkills} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, requiredSkills: e.target.value as string[] }))}
                renderValue={(sel) => sel.join(', ')}>
                {skills.map((s) => (<MenuItem key={s._id} value={s.name}><Checkbox checked={incidentTypeForm.requiredSkills.includes(s.name)} /><ListItemText primary={s.name} /></MenuItem>))}
              </Select>
            </FormControl>
            <TextField label="Công cụ (Từ xa) — cách nhau bằng dấu phẩy" fullWidth value={incidentTypeForm.toolsR} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, toolsR: e.target.value }))} />
            <TextField label="Công cụ (Tại chỗ) — cách nhau bằng dấu phẩy" fullWidth value={incidentTypeForm.toolsO} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, toolsO: e.target.value }))} />
            <TextField label="Phần mềm (Từ xa) — cách nhau bằng dấu phẩy" fullWidth value={incidentTypeForm.licensesR} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, licensesR: e.target.value }))} />
            <TextField label="Phần mềm (Tại chỗ) — cách nhau bằng dấu phẩy" fullWidth value={incidentTypeForm.licensesO} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, licensesO: e.target.value }))} />
            <FormControlLabel control={<Switch checked={incidentTypeForm.requiresVehicleIfOnsite} onChange={(e) => setIncidentTypeForm((f) => ({ ...f, requiresVehicleIfOnsite: e.target.checked }))} />} label="Cần phương tiện khi xử lý tại chỗ" />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setIncidentTypeDialogOpen(false)}>Huỷ</Button><Button variant="contained" onClick={handleSubmitIncidentType}>Lưu</Button></DialogActions>
      </Dialog>

      {/* Dialog chỉnh sửa yêu cầu nguồn lực của sự cố */}
      <Dialog open={requirementsDialogOpen} onClose={() => setRequirementsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Yêu cầu nguồn lực của sự cố</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Kỹ năng yêu cầu</InputLabel>
              <Select multiple value={requirementsForm.requiredSkills} onChange={(e) => setRequirementsForm((f) => ({ ...f, requiredSkills: e.target.value as string[] }))} renderValue={(s) => s.join(', ')}>
                {skills.map((s) => (<MenuItem key={s._id} value={s.name}><Checkbox checked={requirementsForm.requiredSkills.includes(s.name)} /><ListItemText primary={s.name} /></MenuItem>))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Công cụ (Từ xa)</InputLabel>
              <Select multiple value={requirementsForm.toolsR} onChange={(e) => setRequirementsForm((f) => ({ ...f, toolsR: e.target.value as string[] }))} renderValue={(s) => s.join(', ')}>
                {toolTypeOptions.map((t) => (<MenuItem key={t.typeCode} value={t.typeCode}><Checkbox checked={requirementsForm.toolsR.includes(t.typeCode)} /><ListItemText primary={t.name} /></MenuItem>))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Công cụ (Tại chỗ)</InputLabel>
              <Select multiple value={requirementsForm.toolsO} onChange={(e) => setRequirementsForm((f) => ({ ...f, toolsO: e.target.value as string[] }))} renderValue={(s) => s.join(', ')}>
                {toolTypeOptions.map((t) => (<MenuItem key={t.typeCode} value={t.typeCode}><Checkbox checked={requirementsForm.toolsO.includes(t.typeCode)} /><ListItemText primary={t.name} /></MenuItem>))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Phần mềm (Từ xa)</InputLabel>
              <Select multiple value={requirementsForm.licensesR} onChange={(e) => setRequirementsForm((f) => ({ ...f, licensesR: e.target.value as string[] }))} renderValue={(s) => s.join(', ')}>
                {licenseTypeOptions.map((l) => (<MenuItem key={l.typeCode} value={l.typeCode}><Checkbox checked={requirementsForm.licensesR.includes(l.typeCode)} /><ListItemText primary={l.name} /></MenuItem>))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Phần mềm (Tại chỗ)</InputLabel>
              <Select multiple value={requirementsForm.licensesO} onChange={(e) => setRequirementsForm((f) => ({ ...f, licensesO: e.target.value as string[] }))} renderValue={(s) => s.join(', ')}>
                {licenseTypeOptions.map((l) => (<MenuItem key={l.typeCode} value={l.typeCode}><Checkbox checked={requirementsForm.licensesO.includes(l.typeCode)} /><ListItemText primary={l.name} /></MenuItem>))}
              </Select>
            </FormControl>
            <FormControlLabel control={<Switch checked={requirementsForm.requiresVehicleIfOnsite} onChange={(e) => setRequirementsForm((f) => ({ ...f, requiresVehicleIfOnsite: e.target.checked }))} />} label="Cần phương tiện khi xử lý tại chỗ" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRequirementsDialogOpen(false)}>Huỷ</Button>
          <Button variant="contained" onClick={handleSaveRequirements}>Lưu</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default CompanyPortal