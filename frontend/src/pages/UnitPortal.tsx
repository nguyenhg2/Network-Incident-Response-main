import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
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

const NHAN_TRANG_THAI: Record<string, { label: string; color: 'error' | 'warning' | 'info' | 'success' | 'default' }> = {
  OPEN:        { label: 'Mới báo cáo',   color: 'error'   },
  DISPATCHED:  { label: 'Đã điều phối',  color: 'warning' },
  IN_PROGRESS: { label: 'Đang xử lý',   color: 'info'    },
  RESOLVED:    { label: 'Hoàn thành',   color: 'success' },
}

const NHAN_TRANG_THAI_TB: Record<string, string> = {
  ACTIVE:      'Hoạt động',
  INACTIVE:    'Ngừng hoạt động',
  MAINTENANCE: 'Bảo trì',
}

function UnitPortal({ user }: UnitPortalProps) {
  const [loaiSuCo, setLoaiSuCo]             = useState<IncidentType[]>([])
  const [bienChe, setBienChe]               = useState<Component[]>([])
  const [suCoList, setSuCoList]             = useState<Incident[]>([])
  const [maLoai, setMaLoai]                 = useState('')
  const [idThietBi, setIdThietBi]           = useState('')
  const [ghiChu, setGhiChu]                 = useState('')
  const [dangGui, setDangGui]               = useState(false)
  const [tab, setTab]                       = useState(0)

  const [formThietBi, setFormThietBi] = useState({
    name: '', type: '', status: 'ACTIVE', location: '',
    serial: '', ipAddress: '', macAddress: '', vendor: '', model: '',
    os: '', cpu: '', ramGB: '', storageGB: '', firmware: '',
    subnet: '', gateway: '', vlan: '', notes: ''
  })
  const [idDangSua, setIdDangSua]         = useState<string | null>(null)
  const [moDialog, setMoDialog]           = useState(false)

  const tenThietBiTheoId = new Map(bienChe.map((c) => [c._id, c.name]))

  const taiDuLieu = async () => {
  
    const scopeParam = user.role === 'COMPANY_ADMIN' && user.unitId
      ? `scope=unit&unitId=${user.unitId}`
      : 'scope=unit'

    const [resLoai, resSuCo, resBienChe] = await Promise.all([
      api.get<IncidentType[]>('/api/incident-types'),
      api.get<Incident[]>(`/api/incidents?${scopeParam}`),
      api.get<Component[]>('/api/components?scope=unit' + (user.role === 'COMPANY_ADMIN' && user.unitId ? `&unitId=${user.unitId}` : '')),
    ])

    setLoaiSuCo(resLoai.data)
    setSuCoList(resSuCo.data)
    setBienChe(resBienChe.data)

    if (!maLoai && resLoai.data.length > 0) {
      setMaLoai(resLoai.data[0].code)
    }
    if (resBienChe.data.length > 0) {
      const conTon = resBienChe.data.some((c) => c._id === idThietBi)
      if (!idThietBi || !conTon) {
        setIdThietBi(resBienChe.data[0]._id)
      }
    }
  }

  useEffect(() => {
    taiDuLieu()
  }, [])

  const handleGuiBaoCao = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!maLoai) return
    setDangGui(true)
    try {
      await api.post('/api/incidents', {
        unitId: user.unitId,       
        typeCode: maLoai,
        componentId: idThietBi || undefined,
        notes: ghiChu || undefined,
      })
      setGhiChu('')
      await taiDuLieu()
    } finally {
      setDangGui(false)
    }
  }

  const handleHoanThanh = async (incidentId: string) => {
    await api.post(`/api/incidents/${incidentId}/resolve`)
    await taiDuLieu()
  }

  const datLaiForm = () => {
    setFormThietBi({
      name: '', type: '', status: 'ACTIVE', location: '',
      serial: '', ipAddress: '', macAddress: '', vendor: '', model: '',
      os: '', cpu: '', ramGB: '', storageGB: '', firmware: '',
      subnet: '', gateway: '', vlan: '', notes: ''
    })
    setIdDangSua(null)
  }

  const moThemThietBi = () => {
    datLaiForm()
    setMoDialog(true)
  }

  const moSuaThietBi = (tb: Component) => {
    setIdDangSua(tb._id)
    setFormThietBi({
      name:      tb.name ?? '',
      type:      tb.type ?? '',
      status:    tb.status ?? 'ACTIVE',
      location:  tb.location ?? '',
      serial:    tb.serial ?? '',
      ipAddress: tb.ipAddress ?? '',
      macAddress:tb.macAddress ?? '',
      vendor:    tb.vendor ?? '',
      model:     tb.model ?? '',
      os:        tb.os ?? '',
      cpu:       tb.cpu ?? '',
      ramGB:     tb.ramGB != null ? String(tb.ramGB) : '',
      storageGB: tb.storageGB != null ? String(tb.storageGB) : '',
      firmware:  tb.firmware ?? '',
      subnet:    tb.networkConfig?.subnet ?? '',
      gateway:   tb.networkConfig?.gateway ?? '',
      vlan:      tb.networkConfig?.vlan ?? '',
      notes:     tb.notes ?? '',
    })
    setMoDialog(true)
  }

  const dongDialog = () => setMoDialog(false)

  const handleLuuThietBi = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user.unitId) return

    const payload = {
      unitId:     user.unitId,
      name:       formThietBi.name,
      type:       formThietBi.type,
      status:     formThietBi.status,
      location:   formThietBi.location   || undefined,
      serial:     formThietBi.serial     || undefined,
      ipAddress:  formThietBi.ipAddress  || undefined,
      macAddress: formThietBi.macAddress || undefined,
      vendor:     formThietBi.vendor     || undefined,
      model:      formThietBi.model      || undefined,
      os:         formThietBi.os         || undefined,
      cpu:        formThietBi.cpu        || undefined,
      ramGB:      formThietBi.ramGB      ? Number(formThietBi.ramGB)      : undefined,
      storageGB:  formThietBi.storageGB  ? Number(formThietBi.storageGB)  : undefined,
      firmware:   formThietBi.firmware   || undefined,
      networkConfig: {
        subnet:  formThietBi.subnet  || undefined,
        gateway: formThietBi.gateway || undefined,
        vlan:    formThietBi.vlan    || undefined,
      },
      notes: formThietBi.notes || undefined,
    }

    if (idDangSua) {
      await api.patch(`/api/components/${idDangSua}`, payload)
    } else {
      await api.post('/api/components', payload)
    }

    datLaiForm()
    setMoDialog(false)
    await taiDuLieu()
  }

  const handleXoaThietBi = async (id: string) => {
    if (!window.confirm('Xác nhận xoá thiết bị này?')) return
    await api.delete(`/api/components/${id}`)
    await taiDuLieu()
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight="bold">Cổng thông tin đơn vị</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Báo cáo sự cố" />
        <Tab label="Biên chế thiết bị" />
      </Tabs>

      {/* ── TAB 0: Báo cáo sự cố ── */}
      {tab === 0 && (
        <Grid container spacing={2}>

          {/* Form báo cáo */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom fontWeight="bold">
                  Gửi báo cáo sự cố
                </Typography>
                <Stack component="form" spacing={2} onSubmit={handleGuiBaoCao}>

                  <TextField
                    select
                    label="Loại sự cố"
                    value={maLoai}
                    onChange={(e) => setMaLoai(e.target.value)}
                    fullWidth
                    required
                  >
                    {loaiSuCo.map((loai) => (
                      <MenuItem key={loai.code} value={loai.code}>
                        {loai.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Thiết bị liên quan (tuỳ chọn)"
                    value={idThietBi}
                    onChange={(e) => setIdThietBi(e.target.value)}
                    fullWidth
                  >
                    <MenuItem value="">-- Không chọn --</MenuItem>
                    {bienChe.map((tb) => (
                      <MenuItem key={tb._id} value={tb._id}>
                        {tb.name} ({tb.type})
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Mô tả / Ghi chú"
                    value={ghiChu}
                    onChange={(e) => setGhiChu(e.target.value)}
                    multiline
                    minRows={2}
                    fullWidth
                  />

                  {bienChe.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Chưa có thiết bị nào. Vào tab "Biên chế thiết bị" để thêm.
                    </Typography>
                  )}

                  <Button
                    type="submit"
                    variant="contained"
                    color="error"
                    disabled={dangGui || !maLoai}
                    size="large"
                  >
                    {dangGui ? 'Đang gửi...' : 'Gửi báo cáo sự cố'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Danh sách sự cố */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom fontWeight="bold">
                  Sự cố của đơn vị ({suCoList.length})
                </Typography>
                <Stack spacing={1}>
                  {suCoList.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Chưa có sự cố nào.
                    </Typography>
                  )}
                  {suCoList.map((inc) => {
                    const trangThai = NHAN_TRANG_THAI[inc.status] ?? { label: inc.status, color: 'default' as const }
                    return (
                      <Box key={inc._id} sx={{ p: 1.5, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
                          <Box>
                            <Typography variant="subtitle2" fontWeight="bold">
                              {loaiSuCo.find(l => l.code === inc.typeCode)?.name ?? inc.typeCode}
                            </Typography>
                            {inc.componentId && (
                              <Typography variant="caption" color="text.secondary">
                                Thiết bị: {tenThietBiTheoId.get(inc.componentId) ?? inc.componentId}
                              </Typography>
                            )}
                            {inc.notes && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                Ghi chú: {inc.notes}
                              </Typography>
                            )}
                            <Typography variant="caption" display="block" color="text.secondary">
                              Báo cáo lúc: {new Date(inc.reportedAt).toLocaleString('vi-VN')}
                            </Typography>
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5}>
                            <Chip
                              label={trangThai.label}
                              color={trangThai.color}
                              size="small"
                            />
                            <Typography variant="caption" color="text.secondary">
                              Ưu tiên: {inc.priority}
                            </Typography>
                            {/* Nút xác nhận hoàn thành — chỉ hiện khi đang xử lý */}
                            {(inc.status === 'DISPATCHED' || inc.status === 'IN_PROGRESS') && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                onClick={() => handleHoanThanh(inc._id)}
                              >
                                Đã xử lý xong
                              </Button>
                            )}
                          </Stack>
                        </Stack>
                      </Box>
                    )
                  })}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

        </Grid>
      )}

      {/* ── TAB 1: Biên chế thiết bị ── */}
      {tab === 1 && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight="bold">
                  Biên chế thiết bị ({bienChe.length})
                </Typography>
                <Button variant="contained" size="small" onClick={moThemThietBi}>
                  Thêm thiết bị
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tên</TableCell>
                      <TableCell>Loại</TableCell>
                      <TableCell>Trạng thái</TableCell>
                      <TableCell>IP</TableCell>
                      <TableCell>MAC</TableCell>
                      <TableCell>Nhà cung cấp</TableCell>
                      <TableCell>Model</TableCell>
                      <TableCell>Hệ điều hành</TableCell>
                      <TableCell>CPU</TableCell>
                      <TableCell>RAM (GB)</TableCell>
                      <TableCell>Lưu trữ (GB)</TableCell>
                      <TableCell>Firmware</TableCell>
                      <TableCell>Subnet</TableCell>
                      <TableCell>Gateway</TableCell>
                      <TableCell>VLAN</TableCell>
                      <TableCell>Ghi chú</TableCell>
                      <TableCell align="right">Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bienChe.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={17} align="center">
                          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                            Chưa có thiết bị nào. Nhấn "Thêm thiết bị" để bắt đầu.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {bienChe.map((tb) => (
                      <TableRow key={tb._id}>
                        <TableCell>{tb.name}</TableCell>
                        <TableCell>{tb.type}</TableCell>
                        <TableCell>
                          <Chip
                            label={NHAN_TRANG_THAI_TB[tb.status] ?? tb.status}
                            color={tb.status === 'ACTIVE' ? 'success' : tb.status === 'INACTIVE' ? 'default' : 'warning'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{tb.ipAddress  || '–'}</TableCell>
                        <TableCell>{tb.macAddress || '–'}</TableCell>
                        <TableCell>{tb.vendor     || '–'}</TableCell>
                        <TableCell>{tb.model      || '–'}</TableCell>
                        <TableCell>{tb.os         || '–'}</TableCell>
                        <TableCell>{tb.cpu        || '–'}</TableCell>
                        <TableCell>{tb.ramGB      ?? '–'}</TableCell>
                        <TableCell>{tb.storageGB  ?? '–'}</TableCell>
                        <TableCell>{tb.firmware   || '–'}</TableCell>
                        <TableCell>{tb.networkConfig?.subnet  || '–'}</TableCell>
                        <TableCell>{tb.networkConfig?.gateway || '–'}</TableCell>
                        <TableCell>{tb.networkConfig?.vlan    || '–'}</TableCell>
                        <TableCell>{tb.notes      || '–'}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" onClick={() => moSuaThietBi(tb)}>Sửa</Button>
                            <Button size="small" color="error" onClick={() => handleXoaThietBi(tb._id)}>Xoá</Button>
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

      {/* ── Dialog thêm / sửa thiết bị ── */}
      <Dialog open={moDialog} onClose={dongDialog} fullWidth maxWidth="md">
        <DialogTitle>
          {idDangSua ? 'Sửa thông tin thiết bị' : 'Thêm thiết bị mới'}
        </DialogTitle>
        <DialogContent>
          <Stack component="form" spacing={1.5} onSubmit={handleLuuThietBi} sx={{ mt: 1 }}>

            <Stack direction="row" spacing={1}>
              <TextField
                label="Tên thiết bị" required fullWidth size="small"
                value={formThietBi.name}
                onChange={(e) => setFormThietBi((p) => ({ ...p, name: e.target.value }))}
              />
              <TextField
                label="Loại thiết bị" required fullWidth size="small"
                value={formThietBi.type}
                onChange={(e) => setFormThietBi((p) => ({ ...p, type: e.target.value }))}
              />
              <TextField
                select label="Trạng thái" fullWidth size="small"
                value={formThietBi.status}
                onChange={(e) => setFormThietBi((p) => ({ ...p, status: e.target.value }))}
              >
                <MenuItem value="ACTIVE">Hoạt động</MenuItem>
                <MenuItem value="INACTIVE">Ngừng hoạt động</MenuItem>
                <MenuItem value="MAINTENANCE">Bảo trì</MenuItem>
              </TextField>
            </Stack>

            <Stack direction="row" spacing={1}>
              <TextField
                label="Địa chỉ IP" fullWidth size="small"
                value={formThietBi.ipAddress}
                onChange={(e) => setFormThietBi((p) => ({ ...p, ipAddress: e.target.value }))}
              />
              <TextField
                label="Địa chỉ MAC" fullWidth size="small"
                value={formThietBi.macAddress}
                onChange={(e) => setFormThietBi((p) => ({ ...p, macAddress: e.target.value }))}
              />
              <TextField
                label="Số serial" fullWidth size="small"
                value={formThietBi.serial}
                onChange={(e) => setFormThietBi((p) => ({ ...p, serial: e.target.value }))}
              />
            </Stack>

            <Stack direction="row" spacing={1}>
              <TextField
                label="Nhà cung cấp" fullWidth size="small"
                value={formThietBi.vendor}
                onChange={(e) => setFormThietBi((p) => ({ ...p, vendor: e.target.value }))}
              />
              <TextField
                label="Model" fullWidth size="small"
                value={formThietBi.model}
                onChange={(e) => setFormThietBi((p) => ({ ...p, model: e.target.value }))}
              />
              <TextField
                label="Vị trí đặt thiết bị" fullWidth size="small"
                value={formThietBi.location}
                onChange={(e) => setFormThietBi((p) => ({ ...p, location: e.target.value }))}
              />
            </Stack>

            <Stack direction="row" spacing={1}>
              <TextField
                label="Hệ điều hành" fullWidth size="small"
                value={formThietBi.os}
                onChange={(e) => setFormThietBi((p) => ({ ...p, os: e.target.value }))}
              />
              <TextField
                label="CPU" fullWidth size="small"
                value={formThietBi.cpu}
                onChange={(e) => setFormThietBi((p) => ({ ...p, cpu: e.target.value }))}
              />
              <TextField
                label="RAM (GB)" type="number" fullWidth size="small"
                value={formThietBi.ramGB}
                onChange={(e) => setFormThietBi((p) => ({ ...p, ramGB: e.target.value }))}
              />
              <TextField
                label="Lưu trữ (GB)" type="number" fullWidth size="small"
                value={formThietBi.storageGB}
                onChange={(e) => setFormThietBi((p) => ({ ...p, storageGB: e.target.value }))}
              />
            </Stack>

            <Stack direction="row" spacing={1}>
              <TextField
                label="Firmware" fullWidth size="small"
                value={formThietBi.firmware}
                onChange={(e) => setFormThietBi((p) => ({ ...p, firmware: e.target.value }))}
              />
              <TextField
                label="Subnet" fullWidth size="small"
                value={formThietBi.subnet}
                onChange={(e) => setFormThietBi((p) => ({ ...p, subnet: e.target.value }))}
              />
              <TextField
                label="Gateway" fullWidth size="small"
                value={formThietBi.gateway}
                onChange={(e) => setFormThietBi((p) => ({ ...p, gateway: e.target.value }))}
              />
              <TextField
                label="VLAN" fullWidth size="small"
                value={formThietBi.vlan}
                onChange={(e) => setFormThietBi((p) => ({ ...p, vlan: e.target.value }))}
              />
            </Stack>

            <TextField
              label="Ghi chú" fullWidth size="small"
              value={formThietBi.notes}
              onChange={(e) => setFormThietBi((p) => ({ ...p, notes: e.target.value }))}
              multiline minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={dongDialog}>Huỷ</Button>
          <Button variant="contained" onClick={handleLuuThietBi as any}>Lưu</Button>
        </DialogActions>
      </Dialog>

    </Stack>
  )
}

export default UnitPortal