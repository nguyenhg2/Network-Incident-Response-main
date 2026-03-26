import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material'


import api from '../api'
import type { Component, Incident, IncidentType, User } from '../types'

interface UnitPortalProps {
  user: User
}

function UnitPortal({ user }: UnitPortalProps) {
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [typeCode, setTypeCode] = useState('')
  const [componentId, setComponentId] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState(0)
  const [componentForm, setComponentForm] = useState({
    name: '',
    type: '',
    status: 'ACTIVE',
    location: '',
    serial: '',
    ipAddress: '',
    macAddress: '',
    vendor: '',
    model: '',
    os: '',
    cpu: '',
    ramGB: '',
    storageGB: '',
    firmware: '',
    subnet: '',
    gateway: '',
    vlan: '',
    notes: ''
  })
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null)
  const [componentDialogOpen, setComponentDialogOpen] = useState(false)
  const componentNameById = new Map(components.map((c) => [c._id, c.name]))

  const statusLabel = (status: string) => {
    if (status === 'DISPATCHED' || status === 'IN_PROGRESS') return 'DISPATCHING'
    if (status === 'RESOLVED') return 'DONE'
    return status
  }

  const load = async () => {
    const [typesRes, incidentsRes, componentsRes] = await Promise.all([
      api.get<IncidentType[]>('/api/incident-types'),
      api.get<Incident[]>('/api/incidents?scope=unit'),
      api.get<Component[]>('/api/components?scope=unit')
    ])
    setIncidentTypes(typesRes.data)
    setIncidents(incidentsRes.data)
    setComponents(componentsRes.data)
    if (!typeCode && typesRes.data.length > 0) {
      const first = typesRes.data[0]
      setTypeCode(first.code)
    }
    if (componentsRes.data.length > 0) {
      const exists = componentsRes.data.some((c) => c._id === componentId)
      if (!componentId || !exists) {
        setComponentId(componentsRes.data[0]._id)
      }
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleTypeChange = (code: string) => {
    setTypeCode(code)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!typeCode || !componentId) return
    setLoading(true)
    try {
      await api.post('/api/incidents', {
        componentId,
        typeCode
      })
      await load()
    } finally {
      setLoading(false)
    }
  }

  const handleResolveIncident = async (incidentId: string) => {
    await api.post(`/api/incidents/${incidentId}/resolve`)
    await load()
  }


  const resetComponentForm = () => {
    setComponentForm({
      name: '',
      type: '',
      status: 'ACTIVE',
      location: '',
      serial: '',
      ipAddress: '',
      macAddress: '',
      vendor: '',
      model: '',
      os: '',
      cpu: '',
      ramGB: '',
      storageGB: '',
      firmware: '',
      subnet: '',
      gateway: '',
      vlan: '',
      notes: ''
    })
    setEditingComponentId(null)
  }

  const openAddComponent = () => {
    resetComponentForm()
    setComponentDialogOpen(true)
  }

  const openEditComponent = (component: Component) => {
    handleEditComponent(component)
    setComponentDialogOpen(true)
  }

  const closeComponentDialog = () => {
    setComponentDialogOpen(false)
  }

  const handleSubmitComponent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user.unitId) {
      return
    }
    const payload = {
      unitId: user.unitId,
      name: componentForm.name,
      type: componentForm.type,
      status: componentForm.status,
      location: componentForm.location || undefined,
      serial: componentForm.serial || undefined,
      ipAddress: componentForm.ipAddress || undefined,
      macAddress: componentForm.macAddress || undefined,
      vendor: componentForm.vendor || undefined,
      model: componentForm.model || undefined,
      os: componentForm.os || undefined,
      cpu: componentForm.cpu || undefined,
      ramGB: componentForm.ramGB ? Number(componentForm.ramGB) : undefined,
      storageGB: componentForm.storageGB ? Number(componentForm.storageGB) : undefined,
      firmware: componentForm.firmware || undefined,
      networkConfig: {
        subnet: componentForm.subnet || undefined,
        gateway: componentForm.gateway || undefined,
        vlan: componentForm.vlan || undefined
      },
      notes: componentForm.notes || undefined
    }

    if (editingComponentId) {
      await api.patch(`/api/components/${editingComponentId}`, payload)
    } else {
      await api.post('/api/components', payload)
    }
    resetComponentForm()
    setComponentDialogOpen(false)
    await load()
  }

  const handleEditComponent = (component: Component) => {
    setEditingComponentId(component._id)
    setComponentForm({
      name: component.name ?? '',
      type: component.type ?? '',
      status: component.status ?? 'ACTIVE',
      location: component.location ?? '',
      serial: component.serial ?? '',
      ipAddress: component.ipAddress ?? '',
      macAddress: component.macAddress ?? '',
      vendor: component.vendor ?? '',
      model: component.model ?? '',
      os: component.os ?? '',
      cpu: component.cpu ?? '',
      ramGB: component.ramGB != null ? String(component.ramGB) : '',
      storageGB: component.storageGB != null ? String(component.storageGB) : '',
      firmware: component.firmware ?? '',
      subnet: component.networkConfig?.subnet ?? '',
      gateway: component.networkConfig?.gateway ?? '',
      vlan: component.networkConfig?.vlan ?? '',
      notes: component.notes ?? ''
    })
  }

  const handleDeleteComponent = async (componentIdToDelete: string) => {
    await api.delete(`/api/components/${componentIdToDelete}`)
    await load()
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Unit Portal</Typography>
      <Tabs value={tab} onChange={(_, value) => setTab(value)}>
        <Tab label="Report Incident" />
        <Tab label="Assets" />
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Report Incident
                </Typography>
                <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                  <TextField
                    select
                    label="Incident Type"
                    value={typeCode}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    fullWidth
                  >
                    {incidentTypes.map((type) => (
                      <MenuItem key={type.code} value={type.code}>
                        {type.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Component"
                    value={componentId}
                    onChange={(e) => setComponentId(e.target.value)}
                    fullWidth
                  >
                    {components.map((component) => (
                      <MenuItem key={component._id} value={component._id}>
                        {component.name} ({component.type})
                      </MenuItem>
                    ))}
                  </TextField>
                  {components.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      No components available. Add components in the Assets tab.
                    </Typography>
                  )}
                  <Button type="submit" variant="contained" disabled={loading || components.length === 0}>
                    Submit
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Incidents ({incidents.length})
                </Typography>
                <Stack spacing={1}>
                  {incidents.map((inc) => (
                    <Box key={inc._id} sx={{ p: 1.5, border: '1px solid #ddd', borderRadius: 1 }}>
                      <Typography variant="subtitle2">
                        {inc.typeCode} | {componentNameById.get(inc.componentId) || inc.componentId} | Priority{' '}
                        {inc.priority} | {statusLabel(inc.status)}
                      </Typography>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                          Reported {new Date(inc.reportedAt).toLocaleString()}
                        </Typography>
                        {(inc.status === 'DISPATCHED' || inc.status === 'IN_PROGRESS') && (
                          <Button size="small" onClick={() => handleResolveIncident(inc._id)}>
                            Mark Done
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">Components Inventory</Typography>
                <Button variant="contained" size="small" onClick={openAddComponent}>
                  Add Component
                </Button>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>IP</TableCell>
                      <TableCell>MAC</TableCell>
                      <TableCell>Vendor</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell>OS</TableCell>
                      <TableCell>CPU</TableCell>
                      <TableCell>RAM</TableCell>
                      <TableCell>Storage</TableCell>
                      <TableCell>Firmware</TableCell>
                      <TableCell>Subnet</TableCell>
                      <TableCell>Gateway</TableCell>
                      <TableCell>VLAN</TableCell>
                        <TableCell>Notes</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {components.map((component) => (
                        <TableRow key={component._id}>
                        <TableCell>{component.name}</TableCell>
                        <TableCell>{component.type}</TableCell>
                        <TableCell>{component.status}</TableCell>
                        <TableCell>{component.ipAddress || '-'}</TableCell>
                        <TableCell>{component.macAddress || '-'}</TableCell>
                        <TableCell>{component.vendor || '-'}</TableCell>
                        <TableCell>{component.model || '-'}</TableCell>
                        <TableCell>{component.os || '-'}</TableCell>
                        <TableCell>{component.cpu || '-'}</TableCell>
                        <TableCell>{component.ramGB ?? '-'}</TableCell>
                        <TableCell>{component.storageGB ?? '-'}</TableCell>
                        <TableCell>{component.firmware || '-'}</TableCell>
                        <TableCell>{component.networkConfig?.subnet || '-'}</TableCell>
                        <TableCell>{component.networkConfig?.gateway || '-'}</TableCell>
                        <TableCell>{component.networkConfig?.vlan || '-'}</TableCell>
                        <TableCell>{component.notes || '-'}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" onClick={() => openEditComponent(component)}>
                              Edit
                            </Button>
                            <Button size="small" color="error" onClick={() => handleDeleteComponent(component._id)}>
                              Delete
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      )}

      <Dialog open={componentDialogOpen} onClose={closeComponentDialog} fullWidth maxWidth="md">
        <DialogTitle>{editingComponentId ? 'Edit Component' : 'Add Component'}</DialogTitle>
        <DialogContent>
          <Stack component="form" spacing={1.5} onSubmit={handleSubmitComponent} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Name"
                value={componentForm.name}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, name: e.target.value }))}
                size="small"
                fullWidth
                required
              />
              <TextField
                label="Type"
                value={componentForm.type}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, type: e.target.value }))}
                size="small"
                fullWidth
                required
              />
              <TextField
                label="Status"
                value={componentForm.status}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, status: e.target.value }))}
                size="small"
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="IP"
                value={componentForm.ipAddress}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, ipAddress: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="MAC"
                value={componentForm.macAddress}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, macAddress: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="Serial"
                value={componentForm.serial}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, serial: e.target.value }))}
                size="small"
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Vendor"
                value={componentForm.vendor}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, vendor: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="Model"
                value={componentForm.model}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, model: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="Location"
                value={componentForm.location}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, location: e.target.value }))}
                size="small"
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="OS"
                value={componentForm.os}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, os: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="CPU"
                value={componentForm.cpu}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, cpu: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="RAM (GB)"
                type="number"
                value={componentForm.ramGB}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, ramGB: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="Storage (GB)"
                type="number"
                value={componentForm.storageGB}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, storageGB: e.target.value }))}
                size="small"
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Firmware"
                value={componentForm.firmware}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, firmware: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="Subnet"
                value={componentForm.subnet}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, subnet: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="Gateway"
                value={componentForm.gateway}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, gateway: e.target.value }))}
                size="small"
                fullWidth
              />
              <TextField
                label="VLAN"
                value={componentForm.vlan}
                onChange={(e) => setComponentForm((prev) => ({ ...prev, vlan: e.target.value }))}
                size="small"
                fullWidth
              />
            </Stack>
            <TextField
              label="Notes"
              value={componentForm.notes}
              onChange={(e) => setComponentForm((prev) => ({ ...prev, notes: e.target.value }))}
              size="small"
              multiline
              minRows={2}
            />
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained">
                Save
              </Button>
              <Button onClick={closeComponentDialog}>Cancel</Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  )
}

export default UnitPortal
