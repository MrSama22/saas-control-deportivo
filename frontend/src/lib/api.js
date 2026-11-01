const API_BASE = import.meta.env.VITE_API_URL || ''

const TOKEN_STORAGE_KEY = 'trainapp_jwt_token'
const NEGOCIO_STORAGE_KEY = 'trainapp_negocio_data'

export function getSavedToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function getSavedNegocio() {
  try {
    const raw = localStorage.getItem(NEGOCIO_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAuthSession(token, negocio) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  localStorage.setItem(NEGOCIO_STORAGE_KEY, JSON.stringify(negocio))
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(NEGOCIO_STORAGE_KEY)
}

export function formatCOP(valor) {
  const num = Math.round(Number(valor || 0))
  return '$' + num.toLocaleString('es-CO')
}

export function formatShortCOP(valor) {
  const num = Math.round(Number(valor || 0))
  if (num >= 1000 && num % 1000 === 0) {
    return `$${num / 1000}k`
  }
  return formatCOP(num)
}

async function request(path, options = {}) {
  const token = getSavedToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (res.status === 401 && path !== '/api/auth/login') {
    clearAuthSession()
    window.dispatchEvent(new Event('trainapp:unauthorized'))
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.detail || 'Error de comunicación con el servidor')
  }
  return data
}

export const api = {
  login: (telefono, pin) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ telefono, pin }),
    }),

  registerNegocio: (payload) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDemoAccounts: () => request('/api/auth/demo-accounts'),

  getMe: () => request('/api/auth/me'),

  getResumenCajaHoy: () => request('/api/caja/resumen-hoy'),

  updateNegocioConfig: (payload) =>
    request('/api/negocio/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  scanQr: (qr_token, forzar_doble_escaneo = false) =>
    request('/api/scan', {
      method: 'POST',
      body: JSON.stringify({ qr_token, forzar_doble_escaneo }),
    }),

  getUsuarios: () => request('/api/usuarios'),

  getDeudores: () => request('/api/deudores'),

  crearUsuario: (payload) =>
    request('/api/usuarios', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  registrarPagoAhora: (
    usuarioId,
    { planId = null, metodoPago = 'EFECTIVO', saldoPendiente = 0 } = {}
  ) =>
    request(`/api/usuarios/${usuarioId}/pagar`, {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        metodo_pago: metodoPago,
        saldo_pendiente: Number(saldoPendiente || 0),
      }),
    }),

  abonarSaldo: (usuarioId, { montoAbono, metodoPago = 'EFECTIVO' }) =>
    request(`/api/usuarios/${usuarioId}/abonar`, {
      method: 'POST',
      body: JSON.stringify({
        monto_abono: Number(montoAbono),
        metodo_pago: metodoPago,
      }),
    }),

  congelarDias: (usuarioId, dias) =>
    request(`/api/usuarios/${usuarioId}/congelar-dias`, {
      method: 'POST',
      body: JSON.stringify({ dias: Number(dias) }),
    }),

  togglePausaAlumno: (usuarioId, pausado = null) =>
    request(`/api/usuarios/${usuarioId}/pausar`, {
      method: 'POST',
      body: JSON.stringify({ pausado }),
    }),

  getPlanes: () => request('/api/planes'),

  crearPlan: (payload) =>
    request('/api/planes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPasePublico: (qr_token) => request(`/api/pase/${encodeURIComponent(qr_token)}`),
}

export function buildWhatsAppLink(telefono, mensajeTemplate, usuario, negocio) {
  const cleanPhone = (telefono || '').replace(/\D/g, '')
  const linkPase = `${window.location.origin}/pase/${usuario.qr_token}`
  const extraSaldo =
    usuario.saldo_pendiente > 0
      ? ` (Saldo pendiente: ${formatCOP(usuario.saldo_pendiente)})`
      : ''
  const mensaje = (
    mensajeTemplate ||
    'Hola {nombre} 👋, te escribimos de *{gimnasio}*. Mira tu pase aquí: {link_pase}'
  )
    .replace(/\{nombre\}/g, usuario.nombre || '')
    .replace(/\{gimnasio\}/g, negocio?.nombre_gimnasio || 'tu club')
    .replace(/\{plan\}/g, (usuario.plan_nombre || 'tu plan') + extraSaldo)
    .replace(/\{link_pase\}/g, linkPase)

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`
}

export function buildWelcomeWhatsAppLink(usuario, negocio) {
  const cleanPhone = (usuario.telefono || '').replace(/\D/g, '')
  const linkPase = `${window.location.origin}/pase/${usuario.qr_token}`
  const detallesClases =
    usuario.clases_restantes !== null && usuario.clases_restantes !== undefined
      ? `${usuario.clases_restantes} clases disponibles`
      : `Mensualidad activa (${usuario.dias_restantes} días)`

  const notaSaldo =
    usuario.saldo_pendiente > 0
      ? `\n⚠️ Saldo pendiente por abonar: *${formatCOP(usuario.saldo_pendiente)}*`
      : ''

  const mensaje = `¡Hola ${usuario.nombre}! 🎉 Bienvenido/a a *${
    negocio?.nombre_gimnasio || 'nuestro club'
  }*.\n\n✅ Plan activo: *${usuario.plan_nombre}* (${detallesClases}).${notaSaldo}\n📲 Guarda este link para mostrar tu código QR al entrar a entrenar:\n${linkPase}`

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`
}
