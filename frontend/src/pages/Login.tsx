import { useState } from 'react'
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'

import api from '../api'
import type { User } from '../types'

interface LoginProps {
  onLogin: (user: User) => void
}

const tokenKey = 'access_token'

function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      const res = await api.post('/api/auth/login', { email, password })
      localStorage.setItem(tokenKey, res.data.access_token)
      const me = await api.get<User>('/api/auth/me')
      onLogin(me.data)
    } catch (err) {
      setError('Login failed. Check credentials.')
    }
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="70vh">
      <Card sx={{ width: 420 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Login
          </Typography>
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              fullWidth
            />
            <TextField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              fullWidth
            />
            {error && <Typography color="error">{error}</Typography>}
            <Button type="submit" variant="contained">
              Sign In
            </Button>
          </Stack>
          <Typography variant="caption" display="block" mt={2} color="text.secondary">
            Demo: admin@acme.local / admin123 or unit1@acme.local / unit123
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

export default Login
