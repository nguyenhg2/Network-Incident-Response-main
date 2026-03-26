import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
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
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from 'react-leaflet'
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
const ROUTER_BASE_URL = (
  import.meta.env.VITE_ROUTER_URL || 'https://router.project-osrm.org'
).replace(/\/$/, '')

// Fix default marker icons in Leaflet with Vite
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

function UnitLocationPicker({
  lat,
  lng,
  onChange
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}) {
  function ClickHandler() {
    useMapEvents({
      click(event) {
        onChange(event.latlng.lat, event.latlng.lng)
      }
    })
    return null
  }

  const center: [number, number] = lat != null && lng != null ? [lat, lng] : [16.0, 106.0]

  return (
    <Box className="unit-map-shell">
      <MapContainer center={center} zoom={lat != null && lng != null ? 12 : 5} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
        />
        <ClickHandler />
        {lat != null && lng != null && <Marker position={[lat, lng]} />}
      </MapContainer>
    </Box>
  )
}

interface CompanyPortalProps {
  user: User
}

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
  const [routeLines, setRouteLines] = useState<Record<string, [number, number][]>>({})
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
    name: '',
    skills: [] as string[],
    lat: '',
    lng: '',
    address: '',
    availableNow: true,
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
    name: '',
    address: '',
    lat: '',
    lng: '',
    remoteAccessReady: false,
    isSupportStation: false
  })
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  const [skillDialogMode, setSkillDialogMode] = useState<'add' | 'edit'>('add')
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [skillForm, setSkillForm] = useState({ name: '' })
  const [incidentTypeDialogOpen, setIncidentTypeDialogOpen] = useState(false)
  const [incidentTypeDialogMode, setIncidentTypeDialogMode] = useState<'add' | 'edit'>('add')
  const [editingIncidentTypeId, setEditingIncidentTypeId] = useState<string | null>(null)
  const [incidentTypeForm, setIncidentTypeForm] = useState({
    code: '',
    name: '',
    defaultPriority: 3,
    defaultSetupRemote: 0.5,
    defaultFeasRemote: true,
    defaultFeasOnsite: true,
    requiredSkills: [] as string[],
    toolsR: '',
    toolsO: '',
    licensesR: '',
    licensesO: '',
    requiresVehicleIfOnsite: false
  })

  const availableTechs = technicians.filter((t) => t.availableNow).length
  const vehicleQty = vehicles.reduce((sum, v) => sum + v.availableQty, 0)
  const existingStation = units.find((u) => u.isSupportStation)
  const stationLocked = Boolean(existingStation && existingStation._id !== editingUnitId)
  const stationLocation = existingStation?.location
  const stationReady = Boolean(stationLocation)
  const toolTypeOptions = Array.from(
    new Map(
      [
        ...tools.map((tool) => [tool.typeCode, tool.name]),
        ...requirementsForm.toolsR.map((code) => [code, code]),
        ...requirementsForm.toolsO.map((code) => [code, code])
      ] as Array<[string, string]>
    ).entries()
  ).map(([typeCode, name]) => ({ typeCode, name }))
  const licenseTypeOptions = Array.from(
    new Map(
      [
        ...licenses.map((lic) => [lic.typeCode, lic.name]),
        ...requirementsForm.licensesR.map((code) => [code, code]),
        ...requirementsForm.licensesO.map((code) => [code, code])
      ] as Array<[string, string]>
    ).entries()
  ).map(([typeCode, name]) => ({ typeCode, name }))
  const activeIncidents = incidents.filter((inc) => inc.status !== 'RESOLVED')
  const onsiteDispatches = activeIncidents.filter((inc) => inc.dispatch?.mode === 'O')
  const incidentRowsPerPage = 5
  const pagedIncidents = activeIncidents.slice(
    incidentPage * incidentRowsPerPage,
    incidentPage * incidentRowsPerPage + incidentRowsPerPage
  )
  const statusLabel = (status: string) => {
    if (status === 'DISPATCHED' || status === 'IN_PROGRESS' || status === 'DISPATCHING') return 'Đang điều phối'
    if (status === 'OPEN') return 'Mở'
    if (status === 'RESOLVED') return 'Hoàn tất'
    return status
  }
  const statusBuckets = [
    { key: 'OPEN', label: 'Mở', color: '#0277bd' },
    { key: 'DISPATCHING', label: 'Đang điều phối', color: '#f9a825' },
    { key: 'RESOLVED', label: 'Hoàn tất', color: '#2e7d32' }
  ]
  const rawStatusCounts = incidents.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.status] = (acc[inc.status] ?? 0) + 1
    return acc
  }, {})
  const statusCounts: Record<string, number> = {
    OPEN: rawStatusCounts.OPEN ?? 0,
    DISPATCHING: (rawStatusCounts.DISPATCHED ?? 0) + (rawStatusCounts.IN_PROGRESS ?? 0),
    RESOLVED: rawStatusCounts.RESOLVED ?? 0
  }
  const maxStatusCount = Math.max(1, ...statusBuckets.map((b) => statusCounts[b.key] ?? 0))
  const typeCounts = incidents.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.typeCode] = (acc[inc.typeCode] ?? 0) + 1
    return acc
  }, {})
  const typeData = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
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
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!stationLocation) {
      setRouteLines({})
      return
    }
    const requests = onsiteDispatches
      .map((inc) => {
        const unit = unitById.get(inc.unitId)
        if (!unit?.location) return null
        return { incidentId: inc._id, unit }
      })
      .filter(Boolean) as Array<{ incidentId: string; unit: Unit }>
    if (requests.length === 0) {
      setRouteLines({})
      return
    }
    const controller = new AbortController()
    const fetchRoutes = async () => {
      const entries = await Promise.all(
        requests.map(async ({ incidentId, unit }) => {
          const url = `${ROUTER_BASE_URL}/route/v1/driving/${stationLocation.lng},${stationLocation.lat};${unit.location.lng},${unit.location.lat}?overview=full&geometries=geojson`
          try {
            const res = await fetch(url, { signal: controller.signal })
            if (!res.ok) {
              throw new Error('route fetch failed')
            }
            const data = await res.json()
            const coords = data.routes?.[0]?.geometry?.coordinates
            if (!coords || coords.length === 0) {
              throw new Error('no route')
            }
            const latlngs = coords.map(
              ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
            )
            return [incidentId, latlngs] as const
          } catch {
            return [
              incidentId,
              [
                [stationLocation.lat, stationLocation.lng],
                [unit.location.lat, unit.location.lng]
              ] as [number, number][]
            ] as const
          }
        })
      )
      if (!controller.signal.aborted) {
        setRouteLines(Object.fromEntries(entries))
      }
    }
    fetchRoutes()
    return () => controller.abort()
  }, [stationLocation, onsiteDispatches, unitById])

  const handleOptimize = async () => {
    setOptimizing(true)
    try {
      const res = await api.post<OptimizeResult>('/api/optimize/dispatch-now', {})
      setResult(res.data)
      await load()
    } finally {
      setOptimizing(false)
    }
  }

  const openAddTech = () => {
    setTechDialogMode('add')
    setEditingTechId(null)
    const stationLat = stationLocation?.lat != null ? String(stationLocation.lat) : ''
    const stationLng = stationLocation?.lng != null ? String(stationLocation.lng) : ''
    const stationAddress = stationLocation?.address ?? ''
    setTechForm({
      name: '',
      skills: [],
      lat: stationLat,
      lng: stationLng,
      address: stationAddress,
      availableNow: true,
      dMatrixRows: []
    })
    setTechDialogOpen(true)
  }

  const openEditTech = (tech: Technician) => {
    setTechDialogMode('edit')
    setEditingTechId(tech._id)
    const stationLat = stationLocation?.lat != null ? String(stationLocation.lat) : ''
    const stationLng = stationLocation?.lng != null ? String(stationLocation.lng) : ''
    const stationAddress = stationLocation?.address ?? ''
    setTechForm({
      name: tech.name ?? '',
      skills: tech.skills ?? [],
      lat: stationLat || (tech.homeLocation?.lat != null ? String(tech.homeLocation.lat) : ''),
      lng: stationLng || (tech.homeLocation?.lng != null ? String(tech.homeLocation.lng) : ''),
      address: stationAddress || tech.homeLocation?.address || '',
      availableNow: Boolean(tech.availableNow),
      dMatrixRows: (tech.dMatrix || []).map((entry) => ({
        typeCode: entry.typeCode,
        mode: entry.mode as 'R' | 'O',
        durationHours: String(entry.durationHours)
      }))
    })
    setTechDialogOpen(true)
  }

  const closeTechDialog = () => {
    setTechDialogOpen(false)
  }

  const handleSubmitTech = async () => {
    if (!stationLocation) {
      return
    }
    const lat = Number(stationLocation.lat)
    const lng = Number(stationLocation.lng)
    const dMatrix = techForm.dMatrixRows
      .filter((row) => row.typeCode && row.durationHours !== '')
      .map((row) => ({
        typeCode: row.typeCode,
        mode: row.mode,
        durationHours: Number(row.durationHours)
      }))
    const skills = techForm.skills
    const payload = {
      name: techForm.name,
      skills,
      availableNow: techForm.availableNow,
      homeLocation: { lat, lng, address: stationLocation.address },
      dMatrix
    }
    if (techDialogMode === 'add') {
      await api.post('/api/technicians', payload)
    } else if (editingTechId) {
      await api.patch(`/api/technicians/${editingTechId}`, payload)
    }
    setTechDialogOpen(false)
    await load()
  }

  const handleDeleteTech = async (techId: string) => {
    await api.delete(`/api/technicians/${techId}`)
    await load()
  }

  const openAddTool = () => {
    setToolDialogMode('add')
    setEditingToolId(null)
    setToolForm({ name: '', typeCode: '', availableQty: 1 })
    setToolDialogOpen(true)
  }

  const openEditTool = (tool: Tool) => {
    setToolDialogMode('edit')
    setEditingToolId(tool._id)
    setToolForm({ name: tool.name, typeCode: tool.typeCode, availableQty: tool.availableQty })
    setToolDialogOpen(true)
  }

  const closeToolDialog = () => {
    setToolDialogOpen(false)
  }

  const handleSubmitTool = async () => {
    const payload = {
      name: toolForm.name,
      typeCode: toolForm.typeCode,
      availableQty: Number(toolForm.availableQty)
    }
    if (toolDialogMode === 'add') {
      await api.post('/api/tools', payload)
    } else if (editingToolId) {
      await api.patch(`/api/tools/${editingToolId}`, payload)
    }
    setToolDialogOpen(false)
    await load()
  }

  const handleDeleteTool = async (toolId: string) => {
    await api.delete(`/api/tools/${toolId}`)
    await load()
  }

  const openAddLicense = () => {
    setLicenseDialogMode('add')
    setEditingLicenseId(null)
    setLicenseForm({ name: '', typeCode: '', capTotal: 1, inUseNow: 0 })
    setLicenseDialogOpen(true)
  }

  const openEditLicense = (license: License) => {
    setLicenseDialogMode('edit')
    setEditingLicenseId(license._id)
    setLicenseForm({
      name: license.name,
      typeCode: license.typeCode,
      capTotal: license.capTotal,
      inUseNow: license.inUseNow
    })
    setLicenseDialogOpen(true)
  }

  const closeLicenseDialog = () => {
    setLicenseDialogOpen(false)
  }

  const handleSubmitLicense = async () => {
    const payload = {
      name: licenseForm.name,
      typeCode: licenseForm.typeCode,
      capTotal: Number(licenseForm.capTotal),
      inUseNow: Number(licenseForm.inUseNow)
    }
    if (licenseDialogMode === 'add') {
      await api.post('/api/licenses', payload)
    } else if (editingLicenseId) {
      await api.patch(`/api/licenses/${editingLicenseId}`, payload)
    }
    setLicenseDialogOpen(false)
    await load()
  }

  const handleDeleteLicense = async (licenseId: string) => {
    await api.delete(`/api/licenses/${licenseId}`)
    await load()
  }

  const openAddVehicle = () => {
    setVehicleDialogMode('add')
    setEditingVehicleId(null)
    setVehicleForm({ availableQty: 1 })
    setVehicleDialogOpen(true)
  }

  const openEditVehicle = (vehicle: Vehicle) => {
    setVehicleDialogMode('edit')
    setEditingVehicleId(vehicle._id)
    setVehicleForm({ availableQty: vehicle.availableQty })
    setVehicleDialogOpen(true)
  }

  const closeVehicleDialog = () => {
    setVehicleDialogOpen(false)
  }

  const handleSubmitVehicle = async () => {
    const payload = { availableQty: Number(vehicleForm.availableQty) }
    if (vehicleDialogMode === 'add') {
      await api.post('/api/vehicles', payload)
    } else if (editingVehicleId) {
      await api.patch(`/api/vehicles/${editingVehicleId}`, payload)
    }
    setVehicleDialogOpen(false)
    await load()
  }

  const handleDeleteVehicle = async (vehicleId: string) => {
    await api.delete(`/api/vehicles/${vehicleId}`)
    await load()
  }


  const handleSaveIncidentConfig = async (incidentId: string) => {
    await api.patch(`/api/incidents/${incidentId}`, {
      priority: Number(incidentPriorityEdits[incidentId] ?? 1),
      modeFeas: {
        R: Boolean(incidentModeREdits[incidentId]),
        O: Boolean(incidentModeOEdits[incidentId])
      }
    })
    await load()
  }

  const openRequirementsDialog = (incident: Incident) => {
    const req = incident.requirements || {
      requiredSkills: [],
      requiredToolsByMode: { R: [], O: [] },
      requiredLicensesByMode: { R: [], O: [] },
      requiresVehicleIfOnsite: false
    }
    setRequirementsIncidentId(incident._id)
    setRequirementsForm({
      requiredSkills: req.requiredSkills || [],
      toolsR: req.requiredToolsByMode?.R || [],
      toolsO: req.requiredToolsByMode?.O || [],
      licensesR: req.requiredLicensesByMode?.R || [],
      licensesO: req.requiredLicensesByMode?.O || [],
      requiresVehicleIfOnsite: Boolean(req.requiresVehicleIfOnsite)
    })
    setRequirementsDialogOpen(true)
  }

  const handleSaveRequirements = async () => {
    if (!requirementsIncidentId) {
      return
    }
    await api.patch(`/api/incidents/${requirementsIncidentId}`, {
      requirements: {
        requiredSkills: requirementsForm.requiredSkills,
        requiredToolsByMode: {
          R: requirementsForm.toolsR,
          O: requirementsForm.toolsO
        },
        requiredLicensesByMode: {
          R: requirementsForm.licensesR,
          O: requirementsForm.licensesO
        },
        requiresVehicleIfOnsite: requirementsForm.requiresVehicleIfOnsite
      }
    })
    setRequirementsDialogOpen(false)
    await load()
  }

  const handleCancelDispatch = async (incidentId: string) => {
    await api.post(`/api/incidents/${incidentId}/cancel`)
    await load()
  }

  const toggleIncidentExpand = (incidentId: string) => {
    setExpandedIncidents((prev) => ({ ...prev, [incidentId]: !prev[incidentId] }))
  }

  const toggleRunExpand = (runId: string) => {
    setExpandedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }))
  }

  const openAddUnit = () => {
    setUnitDialogMode('add')
    setEditingUnitId(null)
    setUnitForm({
      name: '',
      address: '',
      lat: '',
      lng: '',
      remoteAccessReady: false,
      isSupportStation: false
    })
    setUnitDialogOpen(true)
  }

  const openEditUnit = (unit: Unit) => {
    setUnitDialogMode('edit')
    setEditingUnitId(unit._id)
    setUnitForm({
      name: unit.name ?? '',
      address: unit.location?.address ?? '',
      lat: unit.location?.lat != null ? String(unit.location.lat) : '',
      lng: unit.location?.lng != null ? String(unit.location.lng) : '',
      remoteAccessReady: Boolean(unit.remoteAccessReady),
      isSupportStation: Boolean(unit.isSupportStation)
    })
    setUnitDialogOpen(true)
  }

  const closeUnitDialog = () => {
    setUnitDialogOpen(false)
  }

  const handleSubmitUnit = async () => {
    const lat = Number(unitForm.lat)
    const lng = Number(unitForm.lng)
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return
    }
    if (unitForm.isSupportStation && existingStation && existingStation._id !== editingUnitId) {
      return
    }
    const payload = {
      name: unitForm.name,
      location: { lat, lng, address: unitForm.address },
      remoteAccessReady: unitForm.remoteAccessReady,
      isSupportStation: unitForm.isSupportStation
    }
    if (unitDialogMode === 'add') {
      await api.post(`/api/companies/${user.companyId}/units`, payload)
    } else if (editingUnitId) {
      await api.patch(`/api/companies/${user.companyId}/units/${editingUnitId}`, payload)
    }
    setUnitDialogOpen(false)
    await load()
  }

  const handleDeleteUnit = async (unitId: string) => {
    await api.delete(`/api/companies/${user.companyId}/units/${unitId}`)
    await load()
  }

  const handleSubmitSkill = async () => {
    if (!skillForm.name.trim()) {
      return
    }
    if (skillDialogMode === 'add') {
      await api.post('/api/skills', { name: skillForm.name.trim() })
    } else if (editingSkillId) {
      await api.patch(`/api/skills/${editingSkillId}`, { name: skillForm.name.trim() })
    }
    setSkillDialogOpen(false)
    await load()
  }

  const parseList = (value: string) =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

  const handleSubmitIncidentType = async () => {
    const payload = {
      code: incidentTypeForm.code,
      name: incidentTypeForm.name,
      defaultPriority: Number(incidentTypeForm.defaultPriority),
      defaultSetupRemote: Number(incidentTypeForm.defaultSetupRemote),
      defaultFeasRemote: Boolean(incidentTypeForm.defaultFeasRemote),
      defaultFeasOnsite: Boolean(incidentTypeForm.defaultFeasOnsite),
      requirements: {
        requiredSkills: incidentTypeForm.requiredSkills,
        requiredToolsByMode: {
          R: parseList(incidentTypeForm.toolsR),
          O: parseList(incidentTypeForm.toolsO)
        },
        requiredLicensesByMode: {
          R: parseList(incidentTypeForm.licensesR),
          O: parseList(incidentTypeForm.licensesO)
        },
        requiresVehicleIfOnsite: Boolean(incidentTypeForm.requiresVehicleIfOnsite)
      }
    }
    if (incidentTypeDialogMode === 'add') {
      await api.post('/api/incident-types', payload)
    } else if (editingIncidentTypeId) {
      await api.patch(`/api/incident-types/${editingIncidentTypeId}`, {
        name: payload.name,
        defaultPriority: payload.defaultPriority,
        defaultSetupRemote: payload.defaultSetupRemote,
        defaultFeasRemote: payload.defaultFeasRemote,
        defaultFeasOnsite: payload.defaultFeasOnsite,
        requirements: payload.requirements
      })
    }
    setIncidentTypeDialogOpen(false)
    await load()
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Bảng điều khiển doanh nghiệp</Typography>
      <Tabs value={mainTab} onChange={(_, value) => setMainTab(value)}>
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
                  Hiển thị {Math.min(activeIncidents.length, incidentRowsPerPage)} trên {activeIncidents.length}
                </Typography>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>Loại</TableCell>
                    <TableCell>Thành phần</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell>Độ ưu tiên</TableCell>
                    <TableCell>Đơn vị</TableCell>
                    <TableCell>Tính khả thi (chế độ)</TableCell>
                    <TableCell>Thời điểm báo cáo</TableCell>
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
                            <IconButton
                              size="small"
                              onClick={() => toggleIncidentExpand(inc._id)}
                              disabled={!isExpandable}
                            >
                              {expandedIncidents[inc._id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                            </IconButton>
                          </TableCell>
                          <TableCell>{inc.typeCode}</TableCell>
                          <TableCell>{componentNameById.get(inc.componentId) || inc.componentId}</TableCell>
                          <TableCell>{statusLabel(inc.status)}</TableCell>
                          <TableCell>
                            <TextField
                              type="number"
                              size="small"
                              value={incidentPriorityEdits[inc._id] ?? inc.priority}
                              onChange={(e) =>
                                setIncidentPriorityEdits((prev) => ({ ...prev, [inc._id]: Number(e.target.value) }))
                              }
                              disabled={!isEditable}
                              sx={{ width: 90 }}
                            />
                          </TableCell>
                          <TableCell>{unitNameById.get(inc.unitId) || inc.unitId}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={incidentModeREdits[inc._id] ?? inc.modeFeas.R}
                                    onChange={(e) =>
                                      setIncidentModeREdits((prev) => ({ ...prev, [inc._id]: e.target.checked }))
                                    }
                                    disabled={!isEditable}
                                    size="small"
                                  />
                                }
                                label="R"
                              />
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={incidentModeOEdits[inc._id] ?? inc.modeFeas.O}
                                    onChange={(e) =>
                                      setIncidentModeOEdits((prev) => ({ ...prev, [inc._id]: e.target.checked }))
                                    }
                                    disabled={!isEditable}
                                    size="small"
                                  />
                                }
                                label="O"
                              />
                            </Stack>
                          </TableCell>
                          <TableCell>{new Date(inc.reportedAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Kỹ năng: {inc.requirements?.requiredSkills?.length ?? 0} | Công cụ (TX/TC):
                              {inc.requirements?.requiredToolsByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredToolsByMode?.O?.length ?? 0} | Công cụ phần mềm (TX/TC):
                              {inc.requirements?.requiredLicensesByMode?.R?.length ?? 0}/
                              {inc.requirements?.requiredLicensesByMode?.O?.length ?? 0} | Phương tiện:
                              {inc.requirements?.requiresVehicleIfOnsite ? 'Có' : 'Không'}
                            </Typography>
                            <Button size="small" onClick={() => openRequirementsDialog(inc)}>
                              Chỉnh sửa
                            </Button>
                          </TableCell>
                          <TableCell>
                            {isEditable ? (
                              <Button size="small" onClick={() => handleSaveIncidentConfig(inc._id)}>
                                Lưu
                              </Button>
                            ) : (
                              (inc.status === 'DISPATCHED' || inc.status === 'IN_PROGRESS') && (
                                <Button size="small" color="warning" onClick={() => handleCancelDispatch(inc._id)}>
                                  Hủy điều phối
                                </Button>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={10} sx={{ py: 0 }}>
                            <Collapse in={expandedIncidents[inc._id]} timeout="auto" unmountOnExit>
                              <Box sx={{ p: 2, backgroundColor: '#fafafa', borderRadius: 1 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                  Nguồn lực đã điều phối
                                </Typography>
                                {inc.dispatch ? (
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>Kỹ thuật viên</TableCell>
                                        <TableCell>Chế độ</TableCell>
                                        <TableCell>Công cụ</TableCell>
                                        <TableCell>Công cụ phần mềm</TableCell>
                                        <TableCell>Phương tiện</TableCell>
                                        <TableCell>Thời gian đến dự kiến (giờ)</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      <TableRow>
                                        <TableCell>
                                          {techNameById.get(inc.dispatch.assignedTechId) || inc.dispatch.assignedTechId}
                                        </TableCell>
                                        <TableCell>{inc.dispatch.mode}</TableCell>
                                        <TableCell>{inc.dispatch.allocatedTools.join(', ') || 'Không có'}</TableCell>
                                        <TableCell>{inc.dispatch.allocatedLicenses.join(', ') || 'Không có'}</TableCell>
                                        <TableCell>{inc.dispatch.vehicleAllocated ? 'Có' : 'Không'}</TableCell>
                                        <TableCell>{inc.dispatch.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    Chưa có điều phối nào được gán.
                                  </Typography>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={activeIncidents.length}
                page={incidentPage}
                onPageChange={(_, newPage) => setIncidentPage(newPage)}
                rowsPerPage={incidentRowsPerPage}
                rowsPerPageOptions={[incidentRowsPerPage]}
              />
            </CardContent>
          </Card>

          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12} md={4}>
              <Stack spacing={2}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Nguồn lực
                    </Typography>
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Danh mục</TableCell>
                            <TableCell>Tên</TableCell>
                            <TableCell>Mã</TableCell>
                            <TableCell align="right">Khả dụng</TableCell>
                            <TableCell align="right">Tổng</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell>Kỹ thuật viên</TableCell>
                            <TableCell>Kỹ thuật viên sẵn sàng</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell align="right">{availableTechs}</TableCell>
                            <TableCell align="right">{technicians.length}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Phương tiện</TableCell>
                            <TableCell>Nguồn phương tiện</TableCell>
                            <TableCell>-</TableCell>
                            <TableCell align="right">{vehicleQty}</TableCell>
                            <TableCell align="right">{vehicleQty}</TableCell>
                          </TableRow>
                          {tools.map((tool) => (
                            <TableRow key={tool._id}>
                              <TableCell>Công cụ</TableCell>
                              <TableCell>{tool.name}</TableCell>
                              <TableCell>{tool.typeCode}</TableCell>
                              <TableCell align="right">{tool.availableQty}</TableCell>
                              <TableCell align="right">-</TableCell>
                            </TableRow>
                          ))}
                          {licenses.map((lic) => (
                            <TableRow key={lic._id}>
                              <TableCell>Công cụ phần mềm</TableCell>
                              <TableCell>{lic.name}</TableCell>
                              <TableCell>{lic.typeCode}</TableCell>
                              <TableCell align="right">{lic.capTotal - lic.inUseNow}</TableCell>
                              <TableCell align="right">{lic.capTotal}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                    <Button sx={{ mt: 2 }} variant="contained" onClick={handleOptimize} disabled={optimizing} fullWidth>
                      Tối ưu điều phối ngay
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Thống kê sự cố
                    </Typography>
                    <Stack spacing={1.5}>
                      {statusBuckets.map((bucket) => {
                        const count = statusCounts[bucket.key] ?? 0
                        return (
                          <Box key={bucket.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ width: 88 }}>
                              {bucket.label}
                            </Typography>
                            <Box sx={{ flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                              <Box
                                sx={{
                                  width: `${(count / maxStatusCount) * 100}%`,
                                  height: '100%',
                                  backgroundColor: bucket.color,
                                  borderRadius: 4
                                }}
                              />
                            </Box>
                            <Typography variant="caption" sx={{ width: 20, textAlign: 'right' }}>
                              {count}
                            </Typography>
                          </Box>
                        )
                      })}
                    </Stack>

                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Các loại sự cố nổi bật
                    </Typography>
                    <Stack spacing={1.5}>
                      {typeData.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Chưa ghi nhận sự cố.
                        </Typography>
                      )}
                      {typeData.map(([typeCode, count]) => (
                        <Box key={typeCode} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" sx={{ width: 110 }}>
                            {typeCode}
                          </Typography>
                          <Box sx={{ flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                            <Box
                              sx={{
                                width: `${(count / maxTypeCount) * 100}%`,
                                height: '100%',
                                backgroundColor: '#546e7a',
                                borderRadius: 4
                              }}
                            />
                          </Box>
                          <Typography variant="caption" sx={{ width: 20, textAlign: 'right' }}>
                            {count}
                          </Typography>
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
                  <Typography variant="h6" gutterBottom>
                    Bản đồ đơn vị
                  </Typography>
                  <Box className="map-shell">
                    <MapContainer
                      center={[16.0, 106.0]}
                      zoom={5}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution={MAP_ATTRIBUTION}
                        url={MAP_TILE_URL}
                      />
                      {stationLocation &&
                        onsiteDispatches.map((inc) => {
                          const unit = unitById.get(inc.unitId)
                          if (!unit?.location) {
                            return null
                          }
                          const route = routeLines[inc._id] ?? [
                            [stationLocation.lat, stationLocation.lng],
                            [unit.location.lat, unit.location.lng]
                          ]
                          return (
                            <Polyline
                              key={`route-${inc._id}`}
                              positions={route}
                              color="#1976d2"
                              weight={3}
                            >
                              <Tooltip sticky>
                                Điều phối tại chỗ: {inc.typeCode} → {unit.name}
                              </Tooltip>
                            </Polyline>
                          )
                        })}
                      {units.map((unit) => (
                        <Fragment key={unit._id}>
                          {unit.activeIncidents && unit.activeIncidents > 0 && (
                            <Marker
                              position={[unit.location.lat, unit.location.lng]}
                              icon={pulseIcon}
                              interactive={false}
                            />
                          )}
                      <Marker
                        position={[unit.location.lat, unit.location.lng]}
                        icon={unit.isSupportStation ? supportStationIcon : DefaultIcon}
                      >
                        <Tooltip direction="top" offset={[0, -18]} permanent className="unit-label-tooltip">
                          {unit.name}
                        </Tooltip>
                        <Popup>
                          <Typography variant="subtitle2">{unit.name}</Typography>
                          <Typography variant="caption">
                            Số sự cố đang hoạt động: {unit.activeIncidents ?? 0}
                          </Typography>
                        </Popup>
                          </Marker>
                        </Fragment>
                      ))}
                    </MapContainer>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Lịch sử điều phối
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell>Thời điểm chạy</TableCell>
                    <TableCell>Phân công</TableCell>
                    <TableCell>Mục tiêu</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dispatchRuns.map((run) => (
                    <Fragment key={run._id}>
                      <TableRow>
                        <TableCell>
                          <IconButton size="small" onClick={() => toggleRunExpand(run._id)}>
                            {expandedRuns[run._id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                          </IconButton>
                        </TableCell>
                        <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{run.result.assignments.length}</TableCell>
                        <TableCell>
                          Z1={run.result.objectives.Z1} | Z2={run.result.objectives.Z2} | Z3={run.result.objectives.Z3}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} sx={{ py: 0 }}>
                          <Collapse in={expandedRuns[run._id]} timeout="auto" unmountOnExit>
                            <Box sx={{ p: 2, backgroundColor: '#fafafa', borderRadius: 1 }}>
                              <Typography variant="subtitle2" gutterBottom>
                                Nguồn lực đã điều phối
                              </Typography>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Sự cố</TableCell>
                                    <TableCell>Đơn vị</TableCell>
                                    <TableCell>Kỹ thuật viên</TableCell>
                                    <TableCell>Chế độ</TableCell>
                                    <TableCell>Công cụ</TableCell>
                                    <TableCell>Công cụ phần mềm</TableCell>
                                    <TableCell>Phương tiện</TableCell>
                                    <TableCell>Thời gian đến dự kiến (giờ)</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {run.result.assignments.map((assignment) => {
                                    const incident = incidentById.get(assignment.incidentId)
                                    const unit = incident ? unitNameById.get(incident.unitId) : undefined
                                    return (
                                      <TableRow key={`${run._id}-${assignment.incidentId}-${assignment.technicianId}`}>
                                        <TableCell>{incident?.typeCode || assignment.incidentId}</TableCell>
                                        <TableCell>{unit || incident?.unitId || '-'}</TableCell>
                                        <TableCell>
                                          {techNameById.get(assignment.technicianId) || assignment.technicianId}
                                        </TableCell>
                                        <TableCell>{assignment.mode}</TableCell>
                                        <TableCell>{assignment.allocatedTools.join(', ') || 'Không có'}</TableCell>
                                        <TableCell>{assignment.allocatedLicenses.join(', ') || 'Không có'}</TableCell>
                                        <TableCell>{assignment.vehicleAllocated ? 'Có' : 'Không'}</TableCell>
                                        <TableCell>{assignment.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                                      </TableRow>
                                    )
                                  })}
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
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Quản trị
            </Typography>
            <Tabs value={manageTab} onChange={(_, value) => setManageTab(value)} sx={{ mb: 2 }}>
              <Tab label="Đơn vị" />
              <Tab label="Kỹ thuật viên" />
              <Tab label="Nguồn lực" />
              <Tab label="Kỹ năng" />
              <Tab label="Loại sự cố" />
            </Tabs>

            {manageTab === 0 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Đơn vị</Typography>
                    <Button variant="contained" size="small" onClick={openAddUnit}>
                      Thêm đơn vị
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên</TableCell>
                        <TableCell>Loại</TableCell>
                        <TableCell>Địa chỉ</TableCell>
                        <TableCell>Vĩ độ</TableCell>
                        <TableCell>Kinh độ</TableCell>
                        <TableCell>Truy cập từ xa</TableCell>
                        <TableCell>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {units.map((unit) => (
                        <TableRow key={unit._id}>
                          <TableCell>{unit.name}</TableCell>
                          <TableCell>{unit.isSupportStation ? 'Trạm hỗ trợ' : 'Đơn vị'}</TableCell>
                          <TableCell>{unit.location?.address || '-'}</TableCell>
                          <TableCell>{unit.location?.lat}</TableCell>
                          <TableCell>{unit.location?.lng}</TableCell>
                          <TableCell>{unit.remoteAccessReady ? 'Có' : 'Không'}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditUnit(unit)}>
                                Chỉnh sửa
                              </Button>
                              <Button size="small" color="error" onClick={() => handleDeleteUnit(unit._id)}>
                                Xóa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 1 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Kỹ thuật viên</Typography>
                    <Button variant="contained" size="small" onClick={openAddTech} disabled={!stationReady}>
                      Thêm kỹ thuật viên
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên</TableCell>
                        <TableCell>Kỹ năng</TableCell>
                        <TableCell>Sẵn sàng</TableCell>
                        <TableCell>Vĩ độ cư trú</TableCell>
                        <TableCell>Kinh độ cư trú</TableCell>
                        <TableCell>dMatrix</TableCell>
                        <TableCell>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {technicians.map((tech) => (
                        <TableRow key={tech._id}>
                          <TableCell>{tech.name}</TableCell>
                          <TableCell>{tech.skills.join(', ') || '-'}</TableCell>
                          <TableCell>{tech.availableNow ? 'Có' : 'Không'}</TableCell>
                          <TableCell>{stationLocation?.lat ?? tech.homeLocation?.lat ?? '-'}</TableCell>
                          <TableCell>{stationLocation?.lng ?? tech.homeLocation?.lng ?? '-'}</TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ display: 'block', maxWidth: 220 }}>
                              {tech.dMatrix ? JSON.stringify(tech.dMatrix) : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditTech(tech)}>
                                Chỉnh sửa
                              </Button>
                              <Button color="error" size="small" onClick={() => handleDeleteTech(tech._id)}>
                                Xóa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 2 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Công cụ</Typography>
                    <Button variant="contained" size="small" onClick={openAddTool}>
                      Thêm công cụ
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên</TableCell>
                        <TableCell>Loại</TableCell>
                        <TableCell>Số lượng khả dụng</TableCell>
                        <TableCell>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tools.map((tool) => (
                        <TableRow key={tool._id}>
                          <TableCell>{tool.name}</TableCell>
                          <TableCell>{tool.typeCode}</TableCell>
                          <TableCell>{tool.availableQty}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditTool(tool)}>
                                Chỉnh sửa
                              </Button>
                              <Button size="small" color="error" onClick={() => handleDeleteTool(tool._id)}>
                                Xóa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Divider sx={{ my: 2 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Công cụ phần mềm</Typography>
                    <Button variant="contained" size="small" onClick={openAddLicense}>
                      Thêm công cụ phần mềm
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên</TableCell>
                        <TableCell>Loại</TableCell>
                        <TableCell>Hạn mức</TableCell>
                        <TableCell>Đang sử dụng</TableCell>
                        <TableCell>Khả dụng</TableCell>
                        <TableCell>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {licenses.map((lic) => (
                        <TableRow key={lic._id}>
                          <TableCell>{lic.name}</TableCell>
                          <TableCell>{lic.typeCode}</TableCell>
                          <TableCell>{lic.capTotal}</TableCell>
                          <TableCell>{lic.inUseNow}</TableCell>
                          <TableCell>{lic.capTotal - lic.inUseNow}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditLicense(lic)}>
                                Chỉnh sửa
                              </Button>
                              <Button size="small" color="error" onClick={() => handleDeleteLicense(lic._id)}>
                                Xóa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Divider sx={{ my: 2 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Phương tiện</Typography>
                    <Button variant="contained" size="small" onClick={openAddVehicle}>
                      Thêm phương tiện
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Nguồn</TableCell>
                        <TableCell>Số lượng khả dụng</TableCell>
                        <TableCell>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {vehicles.map((veh) => (
                        <TableRow key={veh._id}>
                          <TableCell>Nguồn phương tiện</TableCell>
                          <TableCell>{veh.availableQty}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => openEditVehicle(veh)}>
                                Chỉnh sửa
                              </Button>
                              <Button size="small" color="error" onClick={() => handleDeleteVehicle(veh._id)}>
                                Xóa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 3 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Kỹ năng</Typography>
                    <Button variant="contained" size="small" onClick={() => {
                      setSkillDialogMode('add')
                      setEditingSkillId(null)
                      setSkillForm({ name: '' })
                      setSkillDialogOpen(true)
                    }}>
                      Thêm kỹ năng
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên</TableCell>
                        <TableCell>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {skills.map((skill) => (
                        <TableRow key={skill._id}>
                          <TableCell>{skill.name}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                onClick={() => {
                                  setSkillDialogMode('edit')
                                  setEditingSkillId(skill._id)
                                  setSkillForm({ name: skill.name })
                                  setSkillDialogOpen(true)
                                }}
                              >
                                Chỉnh sửa
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                onClick={async () => {
                                  await api.delete(`/api/skills/${skill._id}`)
                                  await load()
                                }}
                              >
                                Xóa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {manageTab === 4 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1">Loại sự cố</Typography>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        setIncidentTypeDialogMode('add')
                        setEditingIncidentTypeId(null)
                        setIncidentTypeForm({
                          code: '',
                          name: '',
                          defaultPriority: 3,
                          defaultSetupRemote: 0.5,
                          defaultFeasRemote: true,
                          defaultFeasOnsite: true,
                          requiredSkills: [],
                          toolsR: '',
                          toolsO: '',
                          licensesR: '',
                          licensesO: '',
                          requiresVehicleIfOnsite: false
                        })
                        setIncidentTypeDialogOpen(true)
                      }}
                    >
                      Thêm loại
                    </Button>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Mã</TableCell>
                        <TableCell>Tên</TableCell>
                        <TableCell>Độ ưu tiên</TableCell>
                        <TableCell>Khả thi từ xa</TableCell>
                        <TableCell>Khả thi tại chỗ</TableCell>
                        <TableCell>Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {incidentTypes.map((type) => (
                        <TableRow key={type._id}>
                          <TableCell>{type.code}</TableCell>
                          <TableCell>{type.name}</TableCell>
                          <TableCell>{type.defaultPriority}</TableCell>
                          <TableCell>{type.defaultFeasRemote ? 'Có' : 'Không'}</TableCell>
                          <TableCell>{type.defaultFeasOnsite ? 'Có' : 'Không'}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                onClick={() => {
                                  setIncidentTypeDialogMode('edit')
                                  setEditingIncidentTypeId(type._id)
                                  setIncidentTypeForm({
                                    code: type.code,
                                    name: type.name,
                                    defaultPriority: type.defaultPriority,
                                    defaultSetupRemote: type.defaultSetupRemote,
                                    defaultFeasRemote: type.defaultFeasRemote,
                                    defaultFeasOnsite: type.defaultFeasOnsite,
                                    requiredSkills: type.requirements?.requiredSkills || [],
                                    toolsR: type.requirements?.requiredToolsByMode?.R?.join(', ') || '',
                                    toolsO: type.requirements?.requiredToolsByMode?.O?.join(', ') || '',
                                    licensesR: type.requirements?.requiredLicensesByMode?.R?.join(', ') || '',
                                    licensesO: type.requirements?.requiredLicensesByMode?.O?.join(', ') || '',
                                    requiresVehicleIfOnsite: Boolean(type.requirements?.requiresVehicleIfOnsite)
                                  })
                                  setIncidentTypeDialogOpen(true)
                                }}
                              >
                                Chỉnh sửa
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                onClick={async () => {
                                  await api.delete(`/api/incident-types/${type._id}`)
                                  await load()
                                }}
                              >
                                Xóa
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

          </CardContent>
        </Card>
      )}

      <Dialog open={unitDialogOpen} onClose={closeUnitDialog} fullWidth maxWidth="sm">
        <DialogTitle>{unitDialogMode === 'add' ? 'Thêm đơn vị' : 'Chỉnh sửa đơn vị'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên"
              value={unitForm.name}
              onChange={(e) => setUnitForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Địa chỉ"
              value={unitForm.address}
              onChange={(e) => setUnitForm((prev) => ({ ...prev, address: e.target.value }))}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Vĩ độ"
                value={unitForm.lat}
                onChange={(e) => setUnitForm((prev) => ({ ...prev, lat: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Kinh độ"
                value={unitForm.lng}
                onChange={(e) => setUnitForm((prev) => ({ ...prev, lng: e.target.value }))}
                fullWidth
              />
            </Stack>
            <UnitLocationPicker
              lat={unitForm.lat === '' ? null : Number(unitForm.lat)}
              lng={unitForm.lng === '' ? null : Number(unitForm.lng)}
              onChange={(lat, lng) =>
                setUnitForm((prev) => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }))
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={unitForm.remoteAccessReady}
                  onChange={(e) =>
                    setUnitForm((prev) => ({ ...prev, remoteAccessReady: e.target.checked }))
                  }
                />
              }
              label="Sẵn sàng truy cập từ xa"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={unitForm.isSupportStation}
                  onChange={(e) =>
                    setUnitForm((prev) => ({ ...prev, isSupportStation: e.target.checked }))
                  }
                  disabled={stationLocked && !unitForm.isSupportStation}
                />
              }
              label="Trạm hỗ trợ"
            />
            {stationLocked && !unitForm.isSupportStation && (
              <Typography variant="caption" color="text.secondary">
                Trạm hỗ trợ đã được thiết lập là {existingStation?.name}.
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitUnit}>
                Lưu
              </Button>
              <Button onClick={closeUnitDialog}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={techDialogOpen} onClose={closeTechDialog} fullWidth maxWidth="md">
        <DialogTitle>{techDialogMode === 'add' ? 'Thêm kỹ thuật viên' : 'Chỉnh sửa kỹ thuật viên'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên"
              value={techForm.name}
              onChange={(e) => setTechForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Vĩ độ trạm hỗ trợ"
                value={stationLocation?.lat ?? ''}
                fullWidth
                disabled
              />
              <TextField
                label="Kinh độ trạm hỗ trợ"
                value={stationLocation?.lng ?? ''}
                fullWidth
                disabled
              />
            </Stack>
            <TextField
              label="Địa chỉ trạm hỗ trợ"
              value={stationLocation?.address ?? ''}
              fullWidth
              disabled
            />
            {!stationReady && (
              <Typography variant="caption" color="error">
                Vui lòng thiết lập đơn vị trạm hỗ trợ trước khi thêm kỹ thuật viên.
              </Typography>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={techForm.availableNow}
                  onChange={(e) => setTechForm((prev) => ({ ...prev, availableNow: e.target.checked }))}
                />
              }
              label="Sẵn sàng hiện tại"
            />
            <FormControl fullWidth>
              <InputLabel id="tech-skills-label">Kỹ năng</InputLabel>
              <Select
                labelId="tech-skills-label"
                multiple
                value={techForm.skills}
                label="Kỹ năng"
                renderValue={(selected) => (selected as string[]).join(', ')}
                onChange={(event) =>
                  setTechForm((prev) => ({ ...prev, skills: event.target.value as string[] }))
                }
              >
                {skills.map((skill) => (
                  <MenuItem key={skill._id} value={skill.name}>
                    <Checkbox checked={techForm.skills.includes(skill.name)} />
                    <ListItemText primary={skill.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="subtitle2">dMatrix (theo loại sự cố)</Typography>
            <Stack spacing={1}>
              {techForm.dMatrixRows.map((row, idx) => (
                <Stack direction="row" spacing={1} key={`${row.typeCode}-${idx}`}>
                  <TextField
                    select
                    label="Loại sự cố"
                    value={row.typeCode}
                    onChange={(e) =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.map((r, rIdx) =>
                          rIdx === idx ? { ...r, typeCode: e.target.value } : r
                        )
                      }))
                    }
                    fullWidth
                  >
                    {incidentTypes.map((type) => (
                      <MenuItem key={type._id} value={type.code}>
                        {type.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Chế độ"
                    value={row.mode}
                    onChange={(e) =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.map((r, rIdx) =>
                          rIdx === idx ? { ...r, mode: e.target.value as 'R' | 'O' } : r
                        )
                      }))
                    }
                    sx={{ width: 120 }}
                  >
                    <MenuItem value="R">Từ xa</MenuItem>
                    <MenuItem value="O">Tại chỗ</MenuItem>
                  </TextField>
                  <TextField
                    label="Thời lượng (giờ)"
                    type="number"
                    value={row.durationHours}
                    onChange={(e) =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.map((r, rIdx) =>
                          rIdx === idx ? { ...r, durationHours: e.target.value } : r
                        )
                      }))
                    }
                    sx={{ width: 150 }}
                  />
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      setTechForm((prev) => ({
                        ...prev,
                        dMatrixRows: prev.dMatrixRows.filter((_, rIdx) => rIdx !== idx)
                      }))
                    }
                  >
                    Loại bỏ
                  </Button>
                </Stack>
              ))}
              <Button
                size="small"
                onClick={() =>
                  setTechForm((prev) => ({
                    ...prev,
                    dMatrixRows: [...prev.dMatrixRows, { typeCode: '', mode: 'R', durationHours: '' }]
                  }))
                }
              >
                Thêm dòng dMatrix
              </Button>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitTech} disabled={!stationReady}>
                Lưu
              </Button>
              <Button onClick={closeTechDialog}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={toolDialogOpen} onClose={closeToolDialog} fullWidth maxWidth="sm">
        <DialogTitle>{toolDialogMode === 'add' ? 'Thêm công cụ' : 'Chỉnh sửa công cụ'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên"
              value={toolForm.name}
              onChange={(e) => setToolForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Mã loại"
              value={toolForm.typeCode}
              onChange={(e) => setToolForm((prev) => ({ ...prev, typeCode: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Số lượng khả dụng"
              type="number"
              value={toolForm.availableQty}
              onChange={(e) => setToolForm((prev) => ({ ...prev, availableQty: Number(e.target.value) }))}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitTool}>
                Lưu
              </Button>
              <Button onClick={closeToolDialog}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={licenseDialogOpen} onClose={closeLicenseDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {licenseDialogMode === 'add' ? 'Thêm công cụ phần mềm' : 'Chỉnh sửa công cụ phần mềm'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên"
              value={licenseForm.name}
              onChange={(e) => setLicenseForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Mã loại"
              value={licenseForm.typeCode}
              onChange={(e) => setLicenseForm((prev) => ({ ...prev, typeCode: e.target.value }))}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Tổng hạn mức"
                type="number"
                value={licenseForm.capTotal}
                onChange={(e) => setLicenseForm((prev) => ({ ...prev, capTotal: Number(e.target.value) }))}
                fullWidth
              />
              <TextField
                label="Đang sử dụng"
                type="number"
                value={licenseForm.inUseNow}
                onChange={(e) => setLicenseForm((prev) => ({ ...prev, inUseNow: Number(e.target.value) }))}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitLicense}>
                Lưu
              </Button>
              <Button onClick={closeLicenseDialog}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={vehicleDialogOpen} onClose={closeVehicleDialog} fullWidth maxWidth="sm">
        <DialogTitle>{vehicleDialogMode === 'add' ? 'Thêm phương tiện' : 'Chỉnh sửa phương tiện'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Số lượng khả dụng"
              type="number"
              value={vehicleForm.availableQty}
              onChange={(e) => setVehicleForm({ availableQty: Number(e.target.value) })}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitVehicle}>
                Lưu
              </Button>
              <Button onClick={closeVehicleDialog}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={skillDialogOpen} onClose={() => setSkillDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{skillDialogMode === 'add' ? 'Thêm kỹ năng' : 'Chỉnh sửa kỹ năng'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên kỹ năng"
              value={skillForm.name}
              onChange={(e) => setSkillForm({ name: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitSkill}>
                Lưu
              </Button>
              <Button onClick={() => setSkillDialogOpen(false)}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog
        open={requirementsDialogOpen}
        onClose={() => setRequirementsDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Yêu cầu sự cố</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="req-skills-label">Kỹ năng bắt buộc</InputLabel>
              <Select
                labelId="req-skills-label"
                multiple
                value={requirementsForm.requiredSkills}
                label="Kỹ năng bắt buộc"
                renderValue={(selected) => (selected as string[]).join(', ')}
                onChange={(event) =>
                  setRequirementsForm((prev) => ({ ...prev, requiredSkills: event.target.value as string[] }))
                }
              >
                {skills.map((skill) => (
                  <MenuItem key={skill._id} value={skill.name}>
                    <Checkbox checked={requirementsForm.requiredSkills.includes(skill.name)} />
                    <ListItemText primary={skill.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={1}>
              <FormControl fullWidth>
                <InputLabel id="req-tools-r-label">Công cụ (từ xa)</InputLabel>
                <Select
                  labelId="req-tools-r-label"
                  multiple
                  value={requirementsForm.toolsR}
                  label="Công cụ (từ xa)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, toolsR: event.target.value as string[] }))
                  }
                >
                  {toolTypeOptions.map((tool) => (
                    <MenuItem key={tool.typeCode} value={tool.typeCode}>
                      <Checkbox checked={requirementsForm.toolsR.includes(tool.typeCode)} />
                      <ListItemText primary={`${tool.name} (${tool.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="req-tools-o-label">Công cụ (tại chỗ)</InputLabel>
                <Select
                  labelId="req-tools-o-label"
                  multiple
                  value={requirementsForm.toolsO}
                  label="Công cụ (tại chỗ)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, toolsO: event.target.value as string[] }))
                  }
                >
                  {toolTypeOptions.map((tool) => (
                    <MenuItem key={tool.typeCode} value={tool.typeCode}>
                      <Checkbox checked={requirementsForm.toolsO.includes(tool.typeCode)} />
                      <ListItemText primary={`${tool.name} (${tool.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction="row" spacing={1}>
              <FormControl fullWidth>
                <InputLabel id="req-licenses-r-label">Công cụ phần mềm (từ xa)</InputLabel>
                <Select
                  labelId="req-licenses-r-label"
                  multiple
                  value={requirementsForm.licensesR}
                  label="Công cụ phần mềm (từ xa)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, licensesR: event.target.value as string[] }))
                  }
                >
                  {licenseTypeOptions.map((lic) => (
                    <MenuItem key={lic.typeCode} value={lic.typeCode}>
                      <Checkbox checked={requirementsForm.licensesR.includes(lic.typeCode)} />
                      <ListItemText primary={`${lic.name} (${lic.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="req-licenses-o-label">Công cụ phần mềm (tại chỗ)</InputLabel>
                <Select
                  labelId="req-licenses-o-label"
                  multiple
                  value={requirementsForm.licensesO}
                  label="Công cụ phần mềm (tại chỗ)"
                  renderValue={(selected) => (selected as string[]).join(', ')}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, licensesO: event.target.value as string[] }))
                  }
                >
                  {licenseTypeOptions.map((lic) => (
                    <MenuItem key={lic.typeCode} value={lic.typeCode}>
                      <Checkbox checked={requirementsForm.licensesO.includes(lic.typeCode)} />
                      <ListItemText primary={`${lic.name} (${lic.typeCode})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <FormControlLabel
              control={
                <Switch
                  checked={requirementsForm.requiresVehicleIfOnsite}
                  onChange={(event) =>
                    setRequirementsForm((prev) => ({ ...prev, requiresVehicleIfOnsite: event.target.checked }))
                  }
                />
              }
              label="Yêu cầu phương tiện khi tại chỗ"
            />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSaveRequirements}>
                Lưu
              </Button>
              <Button onClick={() => setRequirementsDialogOpen(false)}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={incidentTypeDialogOpen} onClose={() => setIncidentTypeDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>
          {incidentTypeDialogMode === 'add' ? 'Thêm loại sự cố' : 'Chỉnh sửa loại sự cố'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Mã"
                value={incidentTypeForm.code}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, code: e.target.value }))}
                fullWidth
                disabled={incidentTypeDialogMode === 'edit'}
              />
              <TextField
                label="Tên"
                value={incidentTypeForm.name}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, name: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Độ ưu tiên mặc định"
                type="number"
                value={incidentTypeForm.defaultPriority}
                onChange={(e) =>
                  setIncidentTypeForm((prev) => ({ ...prev, defaultPriority: Number(e.target.value) }))
                }
                fullWidth
              />
              <TextField
                label="Thời gian thiết lập từ xa mặc định (giờ)"
                type="number"
                value={incidentTypeForm.defaultSetupRemote}
                onChange={(e) =>
                  setIncidentTypeForm((prev) => ({ ...prev, defaultSetupRemote: Number(e.target.value) }))
                }
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <FormControlLabel
                control={
                  <Switch
                    checked={incidentTypeForm.defaultFeasRemote}
                    onChange={(e) =>
                      setIncidentTypeForm((prev) => ({ ...prev, defaultFeasRemote: e.target.checked }))
                    }
                  />
                }
                label="Khả thi từ xa"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={incidentTypeForm.defaultFeasOnsite}
                    onChange={(e) =>
                      setIncidentTypeForm((prev) => ({ ...prev, defaultFeasOnsite: e.target.checked }))
                    }
                  />
                }
                label="Khả thi tại chỗ"
              />
            </Stack>
            <FormControl fullWidth>
              <InputLabel id="incident-required-skills-label">Kỹ năng bắt buộc</InputLabel>
              <Select
                labelId="incident-required-skills-label"
                multiple
                value={incidentTypeForm.requiredSkills}
                label="Kỹ năng bắt buộc"
                renderValue={(selected) => (selected as string[]).join(', ')}
                onChange={(event) =>
                  setIncidentTypeForm((prev) => ({ ...prev, requiredSkills: event.target.value as string[] }))
                }
              >
                {skills.map((skill) => (
                  <MenuItem key={skill._id} value={skill.name}>
                    <Checkbox checked={incidentTypeForm.requiredSkills.includes(skill.name)} />
                    <ListItemText primary={skill.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Công cụ (từ xa)"
                value={incidentTypeForm.toolsR}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, toolsR: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Công cụ (tại chỗ)"
                value={incidentTypeForm.toolsO}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, toolsO: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Công cụ phần mềm (từ xa)"
                value={incidentTypeForm.licensesR}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, licensesR: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Công cụ phần mềm (tại chỗ)"
                value={incidentTypeForm.licensesO}
                onChange={(e) => setIncidentTypeForm((prev) => ({ ...prev, licensesO: e.target.value }))}
                fullWidth
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={incidentTypeForm.requiresVehicleIfOnsite}
                  onChange={(e) =>
                    setIncidentTypeForm((prev) => ({ ...prev, requiresVehicleIfOnsite: e.target.checked }))
                  }
                />
              }
              label="Yêu cầu phương tiện khi tại chỗ"
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleSubmitIncidentType}>
                Lưu
              </Button>
              <Button onClick={() => setIncidentTypeDialogOpen(false)}>Hủy</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(result)} onClose={() => setResult(null)} fullWidth maxWidth="md">
        <DialogTitle>Kết quả tối ưu hóa</DialogTitle>
        <DialogContent>
          {result && (
            <Stack spacing={2}>
              <Typography variant="body2">
                Mục tiêu: Z1={result.objectives.Z1}, Z2={result.objectives.Z2}, Z3={result.objectives.Z3}
              </Typography>
              <Typography variant="subtitle2">Sự cố đã điều phối</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Sự cố</TableCell>
                      <TableCell>Kỹ thuật viên</TableCell>
                      <TableCell>Chế độ</TableCell>
                      <TableCell>Nguồn lực</TableCell>
                      <TableCell>Thời gian (giờ)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.assignments.map((a) => (
                      <TableRow key={`${a.incidentId}-${a.technicianId}`}>
                        <TableCell>{a.incidentId}</TableCell>
                        <TableCell>{a.technicianId}</TableCell>
                        <TableCell>{a.mode}</TableCell>
                        <TableCell>
                          Công cụ: {a.allocatedTools.join(', ') || 'Không có'} | Công cụ phần mềm: {a.allocatedLicenses.join(', ') || 'Không có'}
                        </TableCell>
                        <TableCell>{a.timeToRestoreEstimateHours.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {result.assignments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <Typography variant="caption" color="text.secondary">
                            Không có sự cố nào được điều phối trong lần chạy này.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>

              <Typography variant="subtitle2">Chưa được điều phối</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Sự cố</TableCell>
                      <TableCell>Độ ưu tiên</TableCell>
                      <TableCell>Lý do</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(result.unassigned ?? []).map((entry) => (
                      <TableRow key={`unassigned-${entry.incidentId}`}>
                        <TableCell>{entry.typeCode || entry.incidentId}</TableCell>
                        <TableCell>{entry.priority}</TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            {entry.reasons.map((reason, idx) => (
                              <Typography key={`${entry.incidentId}-reason-${idx}`} variant="caption">
                                {reason}
                              </Typography>
                            ))}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(result.unassigned ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <Typography variant="caption" color="text.secondary">
                            Tất cả các sự cố ứng viên đều đã được điều phối.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>

              <Stack direction="row" justifyContent="flex-end">
                <Button variant="contained" onClick={() => setResult(null)}>
                  Xác nhận
                </Button>
              </Stack>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  )
}

export default CompanyPortal
