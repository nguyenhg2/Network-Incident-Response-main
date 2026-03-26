import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import 'leaflet/dist/leaflet.css'
import './styles.css'

import App from './App'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1b5e20'
    },
    secondary: {
      main: '#1a237e'
    }
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif'
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
