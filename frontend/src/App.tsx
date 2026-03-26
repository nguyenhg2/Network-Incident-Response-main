import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'

import api from './api'
import type { User } from './types'
import Login from './pages/Login'
import UnitPortal from './pages/UnitPortal'
import CompanyPortal from './pages/CompanyPortal'

const tokenKey = 'access_token'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(tokenKey)
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get<User>('/api/auth/me')
      .then((res) => setUser(res.data))
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    localStorage.removeItem(tokenKey)
    setUser(null)
  }

  const homePath = useMemo(() => {
    if (!user) return '/login'
    return user.role === 'COMPANY_ADMIN' ? '/company' : '/unit'
  }, [user])

  if (loading) {
    return <Box p={4}>Loading...</Box>
  }

  return (
    <BrowserRouter>
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Incident Response Dispatch
          </Typography>
          {user && (
            <Box display="flex" gap={2} alignItems="center">
              <Typography variant="body2">{user.email}</Typography>
              <Button color="inherit" onClick={handleLogout}>
                Logout
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} disableGutters sx={{ py: 3, px: { xs: 2, md: 3 } }}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to={homePath} replace /> : <Login onLogin={setUser} />} />
          <Route
            path="/unit"
            element={
              user?.role === 'UNIT_USER' ? (
                <UnitPortal user={user} />
              ) : (
                <Navigate to={homePath} replace />
              )
            }
          />
          <Route
            path="/company"
            element={
              user?.role === 'COMPANY_ADMIN' ? (
                <CompanyPortal user={user} />
              ) : (
                <Navigate to={homePath} replace />
              )
            }
          />
          <Route path="/" element={<Navigate to={homePath} replace />} />
          <Route path="*" element={<Navigate to={homePath} replace />} />
        </Routes>
      </Container>
    </BrowserRouter>
  )
}

export default App
