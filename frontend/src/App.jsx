import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminView from './pages/AdminView.jsx'
import PasePublicoView from './pages/PasePublicoView.jsx'

export default function App() {
  return (
    <Routes>
      {/* Ruta 1: /admin - Vista del entrenador restringida con PIN + barra inferior con [Escanear], [Deudores], [+ Nuevo] */}
      <Route path="/admin" element={<AdminView />} />

      {/* Ruta 2: /pase/:qr_token - Vista pública del alumno con tarjeta QR centrada y cero botones de navegación */}
      <Route path="/pase/:qr_token" element={<PasePublicoView />} />

      {/* Ruta 3: / redirige directamente a /admin */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}
