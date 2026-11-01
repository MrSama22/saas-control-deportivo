import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { QRCodeSVG } from 'qrcode.react'
import {
  QrCode,
  AlertTriangle,
  UserPlus,
  LogOut,
  CheckCircle2,
  XCircle,
  MessageCircle,
  RefreshCw,
  Camera,
  CameraOff,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Settings,
  PlusCircle,
  Users,
  PauseCircle,
  PlayCircle,
  CalendarPlus,
  Wallet,
  Banknote,
  Smartphone,
  SlidersHorizontal,
} from 'lucide-react'
import {
  api,
  getSavedToken,
  getSavedNegocio,
  saveAuthSession,
  clearAuthSession,
  buildWhatsAppLink,
  buildWelcomeWhatsAppLink,
  formatCOP,
  formatShortCOP,
} from '../lib/api.js'
import {
  triggerSuccessFeedback,
  triggerWarningFeedback,
  triggerErrorFeedback,
} from '../lib/sound.js'

export default function AdminView() {
  // Autenticación JWT (30 días en localStorage)
  const [token, setToken] = useState(() => getSavedToken())
  const [negocio, setNegocio] = useState(() => getSavedNegocio())

  // Login Form
  const [modoRegistroClub, setModoRegistroClub] = useState(false)
  const [telefonoLogin, setTelefonoLogin] = useState('3001234567')
  const [pinLogin, setPinLogin] = useState('1234')
  const [nombreNuevoClub, setNombreNuevoClub] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [demoAccounts, setDemoAccounts] = useState([])

  // Navegación Inferior Fija: 'escanear' | 'deudores' | 'nuevo'
  const [activeTab, setActiveTab] = useState('escanear')

  // Datos del Negocio Actual + Resumen de Caja del Día
  const [usuarios, setUsuarios] = useState([])
  const [deudores, setDeudores] = useState([])
  const [planes, setPlanes] = useState([])
  const [resumenCaja, setResumenCaja] = useState({
    asistencias_hoy: 0,
    recaudado_hoy: 0,
    efectivo_hoy: 0,
    nequi_hoy: 0,
  })
  const [loadingData, setLoadingData] = useState(false)

  // Estado del Escáner y Feedback Sensorial Pantalla Completa (VERDE / AMARILLO / ROJO)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [scanOverlay, setScanOverlay] = useState(null)
  const [procesandoPagoOverlay, setProcesandoPagoOverlay] = useState(false)
  const [metodoPagoOverlay, setMetodoPagoOverlay] = useState('EFECTIVO')
  const [saldoPendienteOverlay, setSaldoPendienteOverlay] = useState('')
  const html5QrCodeRef = useRef(null)
  const greenTimerRef = useRef(null)
  const scanLockRef = useRef(false)

  // Ficha Rápida del Alumno (Modal con Pausar/Archivar, Abonos Parciales/Fiado y Congelar Días +7/+15)
  const [fichaAlumno, setFichaAlumno] = useState(null)
  const [fichaMetodoPago, setFichaMetodoPago] = useState('EFECTIVO')
  const [fichaSaldoPendiente, setFichaSaldoPendiente] = useState('0')
  const [fichaMontoAbono, setFichaMontoAbono] = useState('')
  const [fichaLoading, setFichaLoading] = useState(false)
  const [fichaFeedback, setFichaFeedback] = useState('')

  // Estado para pestaña [+ Nuevo]
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [nuevoPlanId, setNuevoPlanId] = useState('')
  const [nuevoMetodoPago, setNuevoMetodoPago] = useState('EFECTIVO')
  const [nuevoSaldoPendiente, setNuevoSaldoPendiente] = useState('0')
  const [creandoUsuario, setCreandoUsuario] = useState(false)
  const [usuarioRecienCreado, setUsuarioRecienCreado] = useState(null)
  const [errorCrearUsuario, setErrorCrearUsuario] = useState('')
  const [filtroDirectorio, setFiltroDirectorio] = useState('activos') // 'activos' | 'pausados'

  // Modal ligero para crear nuevo Plan o editar mensaje de WhatsApp
  const [mostrarConfigModal, setMostrarConfigModal] = useState(false)
  const [nuevoPlanNombre, setNuevoPlanNombre] = useState('')
  const [nuevoPlanClases, setNuevoPlanClases] = useState('12')
  const [nuevoPlanDias, setNuevoPlanDias] = useState('30')
  const [nuevoPlanPrecio, setNuevoPlanPrecio] = useState('80000')
  const [mensajeWhatsappEdit, setMensajeWhatsappEdit] = useState('')
  const [guardandoConfig, setGuardandoConfig] = useState(false)

  useEffect(() => {
    if (!token) {
      api
        .getDemoAccounts()
        .then((list) => setDemoAccounts(list || []))
        .catch(() => {})
    }
  }, [token])

  useEffect(() => {
    const handleUnauth = () => {
      setToken(null)
      setNegocio(null)
    }
    window.addEventListener('trainapp:unauthorized', handleUnauth)
    return () => window.removeEventListener('trainapp:unauthorized', handleUnauth)
  }, [])

  const cargarDatosNegocio = useCallback(async () => {
    if (!token) return
    try {
      setLoadingData(true)
      const [meData, planesData, usuariosData, deudoresData, cajaData] = await Promise.all([
        api.getMe(),
        api.getPlanes(),
        api.getUsuarios(),
        api.getDeudores(),
        api.getResumenCajaHoy(),
      ])
      setNegocio(meData)
      saveAuthSession(token, meData)
      setMensajeWhatsappEdit(meData.mensaje_whatsapp_personalizado || '')
      setPlanes(planesData)
      if (planesData.length > 0 && !nuevoPlanId) {
        setNuevoPlanId(String(planesData[0].id))
      }
      setUsuarios(usuariosData)
      setDeudores(deudoresData)
      setResumenCaja(cajaData)

      // Si hay una ficha rápida abierta, actualizar sus datos en vivo
      setFichaAlumno((prev) => {
        if (!prev) return null
        return usuariosData.find((u) => u.id === prev.id) || prev
      })
    } catch (err) {
      console.error('Error cargando datos del negocio:', err)
    } finally {
      setLoadingData(false)
    }
  }, [token, nuevoPlanId])

  useEffect(() => {
    if (token) {
      cargarDatosNegocio()
    }
  }, [token, cargarDatosNegocio])

  const abrirFichaRapida = (u) => {
    setFichaAlumno(u)
    setFichaMetodoPago('EFECTIVO')
    setFichaSaldoPendiente('0')
    setFichaMontoAbono(u.saldo_pendiente > 0 ? String(Math.round(u.saldo_pendiente)) : '')
    setFichaFeedback('')
  }

  // =====================================================================
  // LÓGICA DE ESCÁNER QR Y FEEDBACK SENSORIAL (VERDE / AMARILLO / ROJO)
  // =====================================================================
  const ejecutarEscaneo = useCallback(
    async (qrTokenInput) => {
      if (!qrTokenInput || scanLockRef.current) return
      scanLockRef.current = true

      if (greenTimerRef.current) {
        clearTimeout(greenTimerRef.current)
      }

      try {
        const res = await api.scanQr(qrTokenInput)
        setScanOverlay(res)
        setMetodoPagoOverlay('EFECTIVO')
        setSaldoPendienteOverlay('0')

        if (res.status === 'VERDE') {
          triggerSuccessFeedback()
          greenTimerRef.current = setTimeout(() => {
            setScanOverlay(null)
            scanLockRef.current = false
          }, 2500)
        } else if (res.status === 'AMARILLO') {
          // Alumno ACTIVO pero DEBE SALDO ("El Fiado Colombiano")
          triggerWarningFeedback()
          greenTimerRef.current = setTimeout(() => {
            setScanOverlay(null)
            scanLockRef.current = false
          }, 5000)
        } else {
          // ROJO: Vencido, sin clases o Pausado/Inactivo
          triggerErrorFeedback()
        }

        cargarDatosNegocio()
      } catch (err) {
        triggerErrorFeedback()
        setScanOverlay({
          status: 'ROJO',
          titulo: 'ERROR DE LECTURA',
          mensaje: err.message || 'No se pudo validar el código QR',
          motivo: 'Verifica tu conexión',
          usuario: null,
        })
      }
    },
    [cargarDatosNegocio]
  )

  const detenerCamara = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop()
        }
        await html5QrCodeRef.current.clear()
      } catch {
        // Ignore cleanup errors
      }
      html5QrCodeRef.current = null
    }
    setCameraActive(false)
  }, [])

  const iniciarCamara = useCallback(async () => {
    setCameraError('')
    await detenerCamara()

    try {
      const scanner = new Html5Qrcode('qr-reader')
      html5QrCodeRef.current = scanner
      setCameraActive(true)

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (!scanLockRef.current) {
            ejecutarEscaneo(decodedText)
          }
        },
        () => {}
      )
    } catch (err) {
      setCameraActive(false)
      const isHttpsIssue =
        window.location.protocol !== 'https:' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'

      if (isHttpsIssue) {
        setCameraError(
          'Safari/Chrome bloqueó la cámara porque estás entrando por IP local sin HTTPS. Usa el túnel HTTPS (Fase 3) o usa el simulador de lectura abajo.'
        )
      } else {
        setCameraError(
          'No se pudo abrir la cámara trasera (verifica dar permiso a la cámara en el navegador o usa los botones de prueba rápida abajo).'
        )
      }
      console.warn('Error al iniciar cámara:', err)
    }
  }, [detenerCamara, ejecutarEscaneo])

  useEffect(() => {
    if (activeTab !== 'escanear' || !token) {
      detenerCamara()
    }
    return () => {
      detenerCamara()
    }
  }, [activeTab, token, detenerCamara])

  // Acción de Registrar Pago o Abono desde el Overlay o Ficha Rápida
  const handleRegistrarPagoAhora = async (
    usuarioId,
    { desdeOverlay = false, metodoPago = 'EFECTIVO', saldoPendiente = 0 } = {}
  ) => {
    try {
      if (desdeOverlay) setProcesandoPagoOverlay(true)
      const actualizado = await api.registrarPagoAhora(usuarioId, {
        metodoPago,
        saldoPendiente: Number(saldoPendiente || 0),
      })
      await cargarDatosNegocio()

      if (desdeOverlay) {
        const quedoConSaldo = actualizado.saldo_pendiente > 0
        if (quedoConSaldo) {
          triggerWarningFeedback()
          setScanOverlay({
            status: 'AMARILLO',
            titulo: `ACTIVO - PERO DEBE ${formatCOP(actualizado.saldo_pendiente)} DE SALDO`,
            mensaje: `Abono registrado en ${metodoPago}. ${actualizado.nombre} ya puede entrenar.`,
            motivo: null,
            usuario: actualizado,
          })
        } else {
          triggerSuccessFeedback()
          setScanOverlay({
            status: 'VERDE',
            titulo: '¡PAGO COMPLETO REGISTRADO!',
            mensaje: `${actualizado.nombre} quedó ACTIVO/A al 100% (${metodoPago}).`,
            motivo: null,
            usuario: actualizado,
          })
        }
        if (greenTimerRef.current) clearTimeout(greenTimerRef.current)
        greenTimerRef.current = setTimeout(() => {
          setScanOverlay(null)
          scanLockRef.current = false
        }, 2600)
      }
    } catch (err) {
      alert(err.message || 'No se pudo registrar el pago.')
    } finally {
      if (desdeOverlay) setProcesandoPagoOverlay(false)
    }
  }

  const handleCobrarSaldoDesdeOverlay = async (usuario, metodoPago) => {
    try {
      setProcesandoPagoOverlay(true)
      const actualizado = await api.abonarSaldo(usuario.id, {
        montoAbono: usuario.saldo_pendiente,
        metodoPago,
      })
      await cargarDatosNegocio()
      triggerSuccessFeedback()
      setScanOverlay({
        status: 'VERDE',
        titulo: '¡SALDO PAGADO AL 100%!',
        mensaje: `${actualizado.nombre} ya no debe nada (${metodoPago}).`,
        motivo: null,
        usuario: actualizado,
      })
      if (greenTimerRef.current) clearTimeout(greenTimerRef.current)
      greenTimerRef.current = setTimeout(() => {
        setScanOverlay(null)
        scanLockRef.current = false
      }, 2500)
    } catch (err) {
      alert(err.message)
    } finally {
      setProcesandoPagoOverlay(false)
    }
  }

  // =====================================================================
  // ACCIONES DE LA FICHA RÁPIDA DEL ALUMNO (PAUSAR, CONGELAR DÍAS, FIADO)
  // =====================================================================
  const handleTogglePausaFicha = async (usuario) => {
    try {
      setFichaLoading(true)
      const actualizado = await api.togglePausaAlumno(usuario.id, !usuario.pausado)
      setFichaAlumno(actualizado)
      setFichaFeedback(
        actualizado.pausado
          ? '⏸️ Alumno PAUSADO (Estado: INACTIVO). Salió de Deudores y su QR quedó bloqueado temporalmente.'
          : '▶️ Alumno REACTIVADO. Su código QR vuelve a estar habilitado.'
      )
      await cargarDatosNegocio()
    } catch (err) {
      alert(err.message)
    } finally {
      setFichaLoading(false)
    }
  }

  const handleCongelarDiasFicha = async (usuario, dias) => {
    try {
      setFichaLoading(true)
      const actualizado = await api.congelarDias(usuario.id, dias)
      setFichaAlumno(actualizado)
      setFichaFeedback(
        `🗓️ Se sumaron +${dias} días por incapacidad/viaje sin cobro. Nueva fecha de vencimiento: ${actualizado.fecha_vencimiento}`
      )
      await cargarDatosNegocio()
    } catch (err) {
      alert(err.message)
    } finally {
      setFichaLoading(false)
    }
  }

  const handleAbonarSaldoFicha = async (e) => {
    e.preventDefault()
    if (!fichaAlumno || !Number(fichaMontoAbono)) return
    try {
      setFichaLoading(true)
      const actualizado = await api.abonarSaldo(fichaAlumno.id, {
        montoAbono: Number(fichaMontoAbono),
        metodoPago: fichaMetodoPago,
      })
      setFichaAlumno(actualizado)
      setFichaMontoAbono(
        actualizado.saldo_pendiente > 0 ? String(Math.round(actualizado.saldo_pendiente)) : ''
      )
      setFichaFeedback(
        actualizado.saldo_pendiente > 0
          ? `✅ Abono registrado en ${fichaMetodoPago}. Saldo restante: ${formatCOP(
              actualizado.saldo_pendiente
            )}`
          : `🎉 ¡Saldo pagado por completo en ${fichaMetodoPago}! El alumno ya sale en VERDE.`
      )
      await cargarDatosNegocio()
    } catch (err) {
      alert(err.message)
    } finally {
      setFichaLoading(false)
    }
  }

  const handleRenovarDesdeFicha = async () => {
    if (!fichaAlumno) return
    try {
      setFichaLoading(true)
      const actualizado = await api.registrarPagoAhora(fichaAlumno.id, {
        metodoPago: fichaMetodoPago,
        saldoPendiente: Number(fichaSaldoPendiente || 0),
      })
      setFichaAlumno(actualizado)
      setFichaFeedback(
        actualizado.saldo_pendiente > 0
          ? `✅ Plan renovado (${fichaMetodoPago}) con saldo pendiente de ${formatCOP(
              actualizado.saldo_pendiente
            )} (Saldrá en AMARILLO al escanear).`
          : `✅ Plan renovado y pagado completo (${fichaMetodoPago}).`
      )
      await cargarDatosNegocio()
    } catch (err) {
      alert(err.message)
    } finally {
      setFichaLoading(false)
    }
  }

  // =====================================================================
  // LOGIN / REGISTRO DE ENTRENADOR (PIN DE 4 DÍGITOS)
  // =====================================================================
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    try {
      let data
      if (modoRegistroClub) {
        data = await api.registerNegocio({
          nombre_gimnasio: nombreNuevoClub,
          telefono_admin: telefonoLogin,
          pin_acceso_admin: pinLogin,
        })
      } else {
        data = await api.login(telefonoLogin, pinLogin)
      }
      saveAuthSession(data.access_token, data.negocio)
      setToken(data.access_token)
      setNegocio(data.negocio)
    } catch (err) {
      setAuthError(err.message || 'Credenciales inválidas')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    detenerCamara()
    clearAuthSession()
    setToken(null)
    setNegocio(null)
  }

  // =====================================================================
  // CREAR NUEVO ALUMNO ([+ Nuevo]) CON SOPORTE DE ABONO PARCIAL ("FIADO")
  // =====================================================================
  const handleCrearUsuario = async (e) => {
    e.preventDefault()
    setErrorCrearUsuario('')
    if (!nuevoNombre.trim() || !nuevoTelefono.trim() || !nuevoPlanId) {
      setErrorCrearUsuario('Completa el nombre, celular de WhatsApp y selecciona un plan.')
      return
    }
    try {
      setCreandoUsuario(true)
      const creado = await api.crearUsuario({
        nombre: nuevoNombre.trim(),
        telefono: nuevoTelefono.trim(),
        plan_id: Number(nuevoPlanId),
        metodo_pago: nuevoMetodoPago,
        saldo_pendiente: Number(nuevoSaldoPendiente || 0),
      })
      setUsuarioRecienCreado(creado)
      setNuevoNombre('')
      setNuevoTelefono('')
      setNuevoSaldoPendiente('0')
      await cargarDatosNegocio()
    } catch (err) {
      setErrorCrearUsuario(err.message || 'Error al registrar alumno')
    } finally {
      setCreandoUsuario(false)
    }
  }

  const handleCrearPlan = async (e) => {
    e.preventDefault()
    if (!nuevoPlanNombre.trim()) return
    try {
      setGuardandoConfig(true)
      const clasesNum = Number(nuevoPlanClases)
      const nuevo = await api.crearPlan({
        nombre: nuevoPlanNombre.trim(),
        clases_totales: clasesNum > 0 ? clasesNum : null,
        duracion_dias: Number(nuevoPlanDias) || 30,
        precio: Number(nuevoPlanPrecio) || 0,
      })
      setNuevoPlanNombre('')
      await cargarDatosNegocio()
      setNuevoPlanId(String(nuevo.id))
    } catch (err) {
      alert(err.message)
    } finally {
      setGuardandoConfig(false)
    }
  }

  const handleGuardarMensajeWhatsapp = async () => {
    try {
      setGuardandoConfig(true)
      const actualizado = await api.updateNegocioConfig({
        mensaje_whatsapp_personalizado: mensajeWhatsappEdit,
      })
      setNegocio(actualizado)
      saveAuthSession(token, actualizado)
      setMostrarConfigModal(false)
    } catch (err) {
      alert(err.message)
    } finally {
      setGuardandoConfig(false)
    }
  }

  // =====================================================================
  // PANTALLA DE LOGIN ULTRA-SIMPLE (SI NO HAY JWT EN LOCALSTORAGE)
  // =====================================================================
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center p-5">
        <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                SaaS Control Deportivo
              </span>
              <h1 className="text-2xl font-black tracking-tight">Acceso Entrenador</h1>
            </div>
          </div>

          {demoAccounts.length > 0 && !modoRegistroClub && (
            <div className="mb-6 bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Cuentas Demo (Prueba Multi-Gimnasio):
              </p>
              <div className="grid grid-cols-1 gap-2">
                {demoAccounts.map((acc) => {
                  const selected =
                    telefonoLogin === acc.telefono_admin && pinLogin === acc.pin_demo
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setTelefonoLogin(acc.telefono_admin)
                        setPinLogin(acc.pin_demo)
                        setAuthError('')
                      }}
                      className={`text-left px-3.5 py-2.5 rounded-xl border text-xs transition flex items-center justify-between ${
                        selected
                          ? 'bg-emerald-500/15 border-emerald-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <span className="font-bold block text-sm">{acc.nombre_gimnasio}</span>
                        <span className="text-slate-400">
                          Cel: {acc.telefono_admin} · PIN: {acc.pin_demo}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-[11px] font-bold text-emerald-400">
                        Usar
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {modoRegistroClub && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nombre de tu Gimnasio / Club / Escuela
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Escuela de Fútbol Halcones"
                  value={nombreNuevoClub}
                  onChange={(e) => setNombreNuevoClub(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-base font-semibold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Número de Celular del Entrenador
              </label>
              <input
                type="tel"
                required
                placeholder="Ej. 3001234567"
                value={telefonoLogin}
                onChange={(e) => setTelefonoLogin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-lg font-bold text-white tracking-wide focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                PIN de Acceso (4 dígitos)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                required
                placeholder="••••"
                value={pinLogin}
                onChange={(e) => setPinLogin(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-2xl font-black text-center tracking-[0.5em] text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {authError && (
              <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm font-medium px-4 py-3 rounded-2xl">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-black text-lg py-4 rounded-2xl shadow-lg shadow-emerald-500/25 transition"
            >
              {authLoading
                ? 'Ingresando...'
                : modoRegistroClub
                ? 'Crear Gimnasio y Entrar'
                : 'Entrar al Panel (Sesión 30 Días)'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={() => {
                setModoRegistroClub(!modoRegistroClub)
                setAuthError('')
              }}
              className="text-xs font-bold text-emerald-400 hover:underline"
            >
              {modoRegistroClub
                ? '← Volver a Iniciar Sesión con PIN'
                : '+ ¿Eres un club nuevo? Registra tu gimnasio aquí'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================================
  // OVERLAY SENSORIAL PANTALLA COMPLETA (VERDE / AMARILLO FIADO / ROJO)
  // =====================================================================
  const renderSensoryOverlay = () => {
    if (!scanOverlay) return null
    const esVerde = scanOverlay.status === 'VERDE'
    const esAmarillo = scanOverlay.status === 'AMARILLO'
    const u = scanOverlay.usuario

    const bgColor = esVerde
      ? 'bg-emerald-600 text-white'
      : esAmarillo
      ? 'bg-amber-400 text-slate-950'
      : 'bg-red-600 text-white'

    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col justify-between p-5 select-none overflow-y-auto transition-all duration-150 ${bgColor}`}
      >
        {/* Cabecera superior */}
        <div className="flex items-center justify-between">
          <span
            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
              esAmarillo ? 'bg-slate-950/15 text-slate-950' : 'bg-black/25 text-white'
            }`}
          >
            {negocio?.nombre_gimnasio}
          </span>
          <button
            type="button"
            onClick={() => {
              if (greenTimerRef.current) clearTimeout(greenTimerRef.current)
              setScanOverlay(null)
              scanLockRef.current = false
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider ${
              esAmarillo ? 'bg-slate-950 text-white' : 'bg-black/30 hover:bg-black/40 text-white'
            }`}
          >
            Cerrar ✕
          </button>
        </div>

        {/* Contenido Central Gigante */}
        <div className="my-auto text-center py-4">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              esAmarillo ? 'bg-slate-950/15' : 'bg-white/20'
            }`}
          >
            {esVerde ? (
              <CheckCircle2 className="w-14 h-14 text-white" />
            ) : esAmarillo ? (
              <AlertTriangle className="w-14 h-14 text-slate-950" />
            ) : (
              <XCircle className="w-14 h-14 text-white" />
            )}
          </div>

          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight leading-none mb-3 drop-shadow-sm">
            {scanOverlay.titulo}
          </h1>

          {u && (
            <p className="text-2xl sm:text-4xl font-extrabold mb-2">{u.nombre}</p>
          )}

          <p className="text-lg font-bold opacity-90 max-w-md mx-auto">
            {scanOverlay.motivo || scanOverlay.mensaje}
          </p>

          {u && (
            <div className="mt-5 grid grid-cols-2 gap-3 max-w-sm mx-auto">
              <div
                className={`rounded-2xl p-3.5 ${
                  esAmarillo ? 'bg-slate-950/15' : 'bg-black/25'
                }`}
              >
                <span className="block text-xs uppercase font-bold opacity-80">
                  Clases Restantes
                </span>
                <span className="text-3xl font-black">
                  {u.clases_restantes !== null && u.clases_restantes !== undefined
                    ? u.clases_restantes
                    : '∞'}
                </span>
              </div>
              <div
                className={`rounded-2xl p-3.5 ${
                  esAmarillo ? 'bg-slate-950/15' : 'bg-black/25'
                }`}
              >
                <span className="block text-xs uppercase font-bold opacity-80">
                  {u.dias_restantes >= 0 ? 'Días Restantes' : 'Días Vencido'}
                </span>
                <span className="text-3xl font-black">{Math.abs(u.dias_restantes)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Acciones Inferiores según el estado (AMARILLO o ROJO o VERDE) */}
        {esAmarillo && u ? (
          <div className="space-y-2.5 max-w-md w-full mx-auto">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={procesandoPagoOverlay}
                onClick={() => handleCobrarSaldoDesdeOverlay(u, 'EFECTIVO')}
                className="bg-slate-950 text-white hover:bg-slate-900 font-black text-sm py-4 px-3 rounded-2xl shadow-xl flex items-center justify-center gap-1.5"
              >
                <Banknote className="w-4 h-4 text-emerald-400" />
                Pagó Saldo ({formatShortCOP(u.saldo_pendiente)}) Efectivo
              </button>
              <button
                type="button"
                disabled={procesandoPagoOverlay}
                onClick={() => handleCobrarSaldoDesdeOverlay(u, 'NEQUI')}
                className="bg-slate-950 text-white hover:bg-slate-900 font-black text-sm py-4 px-3 rounded-2xl shadow-xl flex items-center justify-center gap-1.5"
              >
                <Smartphone className="w-4 h-4 text-purple-400" />
                Pagó Saldo ({formatShortCOP(u.saldo_pendiente)}) Nequi
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (greenTimerRef.current) clearTimeout(greenTimerRef.current)
                setScanOverlay(null)
                scanLockRef.current = false
              }}
              className="w-full bg-slate-950/20 hover:bg-slate-950/30 text-slate-950 font-black text-sm py-3 rounded-2xl"
            >
              Entró a Entrenar (Cobrar el viernes / después)
            </button>
          </div>
        ) : !esVerde ? (
          <div className="space-y-3 max-w-md w-full mx-auto bg-black/25 p-4 rounded-3xl">
            {u && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMetodoPagoOverlay('EFECTIVO')}
                    className={`py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border ${
                      metodoPagoOverlay === 'EFECTIVO'
                        ? 'bg-white text-red-700 border-white'
                        : 'bg-black/30 text-white border-white/20'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    💵 Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetodoPagoOverlay('NEQUI')}
                    className={`py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border ${
                      metodoPagoOverlay === 'NEQUI'
                        ? 'bg-white text-red-700 border-white'
                        : 'bg-black/30 text-white border-white/20'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    📱 Nequi
                  </button>
                </div>

                {/* Campo opcional de Saldo Pendiente ("El Fiado Colombiano") */}
                <div className="flex items-center justify-between gap-2 bg-black/30 px-3 py-2 rounded-xl">
                  <span className="text-xs font-bold text-white/90">
                    ¿Queda debiendo saldo? (Fiado):
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSaldoPendienteOverlay('0')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-black ${
                        Number(saldoPendienteOverlay) === 0
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-white/15 text-white'
                      }`}
                    >
                      $0
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSaldoPendienteOverlay(
                          String(Math.round((u.plan_precio || 80000) / 2))
                        )
                      }
                      className={`px-2 py-1 rounded-lg text-[11px] font-black ${
                        Number(saldoPendienteOverlay) > 0
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-white/15 text-white'
                      }`}
                    >
                      Mitad ({formatShortCOP((u.plan_precio || 80000) / 2)})
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={saldoPendienteOverlay}
                      onChange={(e) => setSaldoPendienteOverlay(e.target.value)}
                      className="w-24 bg-black/40 border border-white/30 rounded-lg px-2 py-1 text-xs font-black text-white text-right"
                      placeholder="0"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={procesandoPagoOverlay}
                  onClick={() =>
                    handleRegistrarPagoAhora(u.id, {
                      desdeOverlay: true,
                      metodoPago: metodoPagoOverlay,
                      saldoPendiente: Number(saldoPendienteOverlay || 0),
                    })
                  }
                  className="w-full bg-white text-red-700 hover:bg-red-50 active:scale-[0.98] font-black text-lg py-4 rounded-2xl shadow-2xl transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-5 h-5 ${procesandoPagoOverlay ? 'animate-spin' : ''}`} />
                  {procesandoPagoOverlay
                    ? 'REGISTRANDO PAGO...'
                    : Number(saldoPendienteOverlay) > 0
                    ? `REGISTRAR ABONO (DEBE ${formatShortCOP(saldoPendienteOverlay)})`
                    : 'REGISTRAR PAGO AHORA'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setScanOverlay(null)
                scanLockRef.current = false
              }}
              className="w-full bg-black/35 hover:bg-black/45 text-white font-bold text-sm py-3 rounded-2xl transition"
            >
              Seguir Escaneando
            </button>
          </div>
        ) : (
          <div className="text-center text-xs font-bold uppercase tracking-widest opacity-80">
            Cerrando automáticamente en 2.5 segundos...
          </div>
        )}
      </div>
    )
  }

  // =====================================================================
  // MODAL DE FICHA RÁPIDA DEL ALUMNO (LAS 3 FUNCIONES DE VIDA REAL)
  // =====================================================================
  const renderFichaAlumnoModal = () => {
    if (!fichaAlumno) return null
    const u = fichaAlumno
    const mitadPrecio = Math.round((u.plan_precio || 80000) / 2)

    return (
      <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-md bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto space-y-4 shadow-2xl">
          {/* Encabezado de la Ficha Rápida */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    u.pausado
                      ? 'bg-slate-700 text-slate-300'
                      : u.estado === 'ACTIVO'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : u.estado === 'ACTIVO_CON_SALDO'
                      ? 'bg-amber-400/20 text-amber-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {u.pausado
                    ? 'ESTADO: INACTIVO (PAUSADO)'
                    : u.estado === 'ACTIVO_CON_SALDO'
                    ? `ACTIVO · DEBE ${formatCOP(u.saldo_pendiente)}`
                    : u.estado}
                </span>
                <span className="text-[11px] text-slate-400 font-semibold">
                  {u.pagos_registrados} pagos en historial
                </span>
              </div>
              <h3 className="text-xl font-black mt-1">{u.nombre}</h3>
              <p className="text-xs text-slate-400">
                {u.plan_nombre} ({formatCOP(u.plan_precio)}) · Vence: {u.fecha_vencimiento}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFichaAlumno(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold"
            >
              Cerrar ✕
            </button>
          </div>

          {fichaFeedback && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-semibold p-3 rounded-2xl">
              {fichaFeedback}
            </div>
          )}

          {/* 1. ABONO A SALDO PENDIENTE ("EL FIADO COLOMBIANO") SI DEBE PLATA */}
          {u.saldo_pendiente > 0 && (
            <form
              onSubmit={handleAbonarSaldoFicha}
              className="bg-amber-500/15 border-2 border-amber-400/50 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4" />
                  Saldo Pendiente (&ldquo;El Fiado&rdquo;)
                </span>
                <span className="text-lg font-black text-amber-300">
                  Debe {formatCOP(u.saldo_pendiente)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFichaMetodoPago('EFECTIVO')}
                  className={`py-2 rounded-xl text-xs font-black border ${
                    fichaMetodoPago === 'EFECTIVO'
                      ? 'bg-amber-400 text-slate-950 border-amber-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700'
                  }`}
                >
                  💵 Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => setFichaMetodoPago('NEQUI')}
                  className={`py-2 rounded-xl text-xs font-black border ${
                    fichaMetodoPago === 'NEQUI'
                      ? 'bg-amber-400 text-slate-950 border-amber-400'
                      : 'bg-slate-900 text-slate-300 border-slate-700'
                  }`}
                >
                  📱 Nequi
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={fichaMontoAbono}
                  onChange={(e) => setFichaMontoAbono(e.target.value)}
                  className="flex-1 bg-slate-950 border border-amber-400/40 rounded-xl px-3 py-2.5 text-sm font-black text-white"
                  placeholder="Monto que abona hoy"
                />
                <button
                  type="submit"
                  disabled={fichaLoading}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl shrink-0"
                >
                  Abonar Ahora
                </button>
              </div>
            </form>
          )}

          {/* 2. BOTÓN DE "CONGELAR DÍAS" (+7 DÍAS / +15 DÍAS POR INCAPACIDAD O VIAJE) */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <CalendarPlus className="w-4 h-4" />
                [+ Sumar días por incapacidad / viaje]
              </span>
              <span className="text-[11px] text-slate-400 font-semibold">Sin cobro extra</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Empuja la fecha de vencimiento ({u.fecha_vencimiento}) para que el alumno no pierda sus días de gimnasio:
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={fichaLoading}
                onClick={() => handleCongelarDiasFicha(u, 7)}
                className="bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 font-black text-xs py-3 rounded-xl transition active:scale-95"
              >
                +7 Días (1 Semana)
              </button>
              <button
                type="button"
                disabled={fichaLoading}
                onClick={() => handleCongelarDiasFicha(u, 15)}
                className="bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 font-black text-xs py-3 rounded-xl transition active:scale-95"
              >
                +15 Días (Quincena)
              </button>
            </div>
          </div>

          {/* 3. RENOVAR PLAN CON OPCIÓN DE SALDO PENDIENTE ("EL FIADO COLOMBIANO") */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 block">
              Registrar Nuevo Pago / Renovar Plan ({formatCOP(u.plan_precio)})
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFichaMetodoPago('EFECTIVO')}
                className={`py-2.5 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 ${
                  fichaMetodoPago === 'EFECTIVO'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <Banknote className="w-4 h-4" />
                💵 Efectivo
              </button>
              <button
                type="button"
                onClick={() => setFichaMetodoPago('NEQUI')}
                className={`py-2.5 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 ${
                  fichaMetodoPago === 'NEQUI'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                📱 Nequi
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1.5">
                Saldo Pendiente Opcional (&ldquo;Profe, hoy le traje una parte y el viernes el resto&rdquo;):
              </label>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setFichaSaldoPendiente('0')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                    Number(fichaSaldoPendiente) === 0
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Pagó Todo ($0 debe)
                </button>
                <button
                  type="button"
                  onClick={() => setFichaSaldoPendiente(String(mitadPrecio))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                    Number(fichaSaldoPendiente) === mitadPrecio
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Debe Mitad ({formatCOP(mitadPrecio)})
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="5000"
                value={fichaSaldoPendiente}
                onChange={(e) => setFichaSaldoPendiente(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-black text-amber-300"
                placeholder="0"
              />
            </div>

            <button
              type="button"
              disabled={fichaLoading}
              onClick={handleRenovarDesdeFicha}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm py-3.5 rounded-xl shadow-lg shadow-emerald-500/20"
            >
              {Number(fichaSaldoPendiente) > 0
                ? `Renovar Plan (Recibir ${formatCOP(
                    Math.max(0, u.plan_precio - Number(fichaSaldoPendiente))
                  )} hoy · Debe ${formatCOP(fichaSaldoPendiente)})`
                : `Registrar Pago Completo (${formatCOP(u.plan_precio)})`}
            </button>
          </div>

          {/* 4. INTERRUPTOR "PAUSAR / ARCHIVAR ALUMNO" (ESTADO: INACTIVO) */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                {u.pausado ? (
                  <PlayCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <PauseCircle className="w-4 h-4 text-amber-400" />
                )}
                Pausar / Archivar Alumno (Estado: INACTIVO)
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Lo saca de Deudores y bloquea su QR sin borrar su historial ni su WhatsApp.
              </p>
            </div>
            <button
              type="button"
              disabled={fichaLoading}
              onClick={() => handleTogglePausaFicha(u)}
              className={`px-3.5 py-2.5 rounded-xl font-black text-xs shrink-0 transition ${
                u.pausado
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30'
              }`}
            >
              {u.pausado ? 'Reactivar Alumno' : 'Pausar / Archivar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const alumnosActivos = usuarios.filter((u) => !u.pausado)
  const alumnosPausados = usuarios.filter((u) => u.pausado)

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-28">
      {renderSensoryOverlay()}
      {renderFichaAlumnoModal()}

      {/* Barra Superior del Gimnasio + CINTILLA DE RESUMEN DE CAJA DEL DÍA */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        {/* Cintilla Superior de Resumen de Caja del Día para el dueño */}
        <div className="bg-emerald-950/90 border-b border-emerald-500/30 px-3 py-1.5 text-center">
          <p className="text-[11px] sm:text-xs font-extrabold tracking-tight text-emerald-200">
            Hoy asistieron:{' '}
            <span className="text-white font-black">{resumenCaja.asistencias_hoy}</span>
            {' | '}Recaudado hoy:{' '}
            <span className="text-emerald-400 font-black">
              {formatCOP(resumenCaja.recaudado_hoy)}
            </span>{' '}
            <span className="text-emerald-300/90 font-semibold">
              (Efectivo: {formatShortCOP(resumenCaja.efectivo_hoy)} / Nequi:{' '}
              {formatShortCOP(resumenCaja.nequi_hoy)})
            </span>
          </p>
        </div>

        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                PANEL ENTRENADOR · PIN ACTIVO
              </p>
              <h1 className="text-base font-black truncate">{negocio?.nombre_gimnasio}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMostrarConfigModal(true)}
              title="Configurar planes y mensaje de WhatsApp"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Cambiar de gimnasio / Cerrar sesión"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-300 flex items-center gap-1 text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal según el botón activo de la barra inferior */}
      <main className="max-w-lg mx-auto p-4">
        {/* ===============================================================
            VISTA 1: [ESCANEAR]
           =============================================================== */}
        {activeTab === 'escanear' && (
          <div className="space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-black">Lector QR de Cancha</h2>
                  <p className="text-xs text-slate-400">
                    Apunta con la cámara trasera al celular del alumno
                  </p>
                </div>
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={iniciarCamara}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                  >
                    <Camera className="w-4 h-4" />
                    Activar Cámara
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={detenerCamara}
                    className="px-3.5 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold text-xs flex items-center gap-1.5"
                  >
                    <CameraOff className="w-4 h-4" />
                    Detener
                  </button>
                )}
              </div>

              <div className="relative w-full min-h-[250px] bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl overflow-hidden flex flex-col items-center justify-center">
                <div id="qr-reader" className="w-full" />
                {!cameraActive && (
                  <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3 text-emerald-400">
                      <QrCode className="w-9 h-9" />
                    </div>
                    <p className="text-sm font-bold text-slate-300 mb-1">
                      Cámara trasera lista (`facingMode: environment`)
                    </p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4">
                      Presiona &ldquo;Activar Cámara&rdquo; para leer un QR real o prueba abajo los estados VERDE, AMARILLO (Fiado) y ROJO.
                    </p>
                    <button
                      type="button"
                      onClick={iniciarCamara}
                      className="px-5 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20"
                    >
                      Iniciar Escáner QR Ahora
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="mt-3 bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs p-3.5 rounded-2xl">
                  {cameraError}
                </div>
              )}
            </div>

            {/* Simulador de Escaneo + Acceso a Ficha Rápida */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                    PRUEBA DE CAMPO Y FICHA RÁPIDA
                  </span>
                  <h3 className="text-base font-black">
                    Simular Escaneo QR o Abrir Ficha
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {usuarios.length} alumnos
                </span>
              </div>

              <div className="space-y-2.5">
                {usuarios.map((u) => {
                  const esVerde = u.estado === 'ACTIVO'
                  const esAmarillo = u.estado === 'ACTIVO_CON_SALDO'
                  const esPausado = u.pausado

                  let dotClass = 'bg-red-500'
                  if (esPausado) dotClass = 'bg-slate-500'
                  else if (esVerde) dotClass = 'bg-emerald-400'
                  else if (esAmarillo) dotClass = 'bg-amber-400'

                  return (
                    <div
                      key={u.id}
                      className={`bg-slate-950 border rounded-2xl p-3 flex items-center justify-between gap-2 ${
                        esPausado ? 'border-slate-800/60 opacity-75' : 'border-slate-800'
                      }`}
                    >
                      <div
                        onClick={() => abrirFichaRapida(u)}
                        className="min-w-0 cursor-pointer flex-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
                          <p className="font-bold text-sm truncate hover:underline">
                            {u.nombre}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {esPausado ? (
                            <span className="text-slate-400 font-semibold">
                              ⏸️ INACTIVO (Pausado) · No sale en Deudores
                            </span>
                          ) : esAmarillo ? (
                            <span className="text-amber-300 font-bold">
                              ⚠️ Debe {formatCOP(u.saldo_pendiente)} de saldo ·{' '}
                              {u.clases_restantes !== null
                                ? `${u.clases_restantes} clases`
                                : `${u.dias_restantes}d`}
                            </span>
                          ) : (
                            <>
                              {u.plan_nombre} ·{' '}
                              {u.clases_restantes !== null
                                ? `${u.clases_restantes} clases`
                                : 'Ilimitado'}{' '}
                              ·{' '}
                              {u.dias_restantes >= 0
                                ? `${u.dias_restantes}d restantes`
                                : `Vencido hace ${Math.abs(u.dias_restantes)}d`}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => abrirFichaRapida(u)}
                          title="Abrir Ficha Rápida (Abonos, Congelar días, Pausar)"
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Ficha</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => ejecutarEscaneo(u.qr_token)}
                          className={`px-3 py-2 rounded-xl font-black text-xs transition ${
                            esVerde
                              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950'
                              : esAmarillo
                              ? 'bg-amber-400/20 border border-amber-400/50 text-amber-300 hover:bg-amber-400 hover:text-slate-950'
                              : 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500 hover:text-white'
                          }`}
                        >
                          Simular QR
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===============================================================
            VISTA 2: [DEUDORES] (EXCLUYE ALUMNOS PAUSADOS / INACTIVOS)
           =============================================================== */}
        {activeTab === 'deudores' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-black flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  Alumnos por Cobrar ({deudores.length})
                </h2>
                {alumnosPausados.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-slate-800 text-[11px] font-bold text-slate-400">
                    {alumnosPausados.length} en pausa oculto(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Incluye planes vencidos, tiqueteras en 0 y saldos pendientes (&ldquo;El Fiado&rdquo;). Si un alumno se fue de vacaciones o exámenes,{' '}
                <strong className="text-slate-200">páusalo</strong> para sacarlo de esta lista sin borrar su QR.
              </p>
            </div>

            {deudores.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h3 className="text-lg font-black mb-1">¡Cero Deudores Activos!</h3>
                <p className="text-xs text-slate-400">
                  Todos los alumnos activos de {negocio?.nombre_gimnasio} están al día.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {deudores.map((d) => {
                  const esSoloSaldo = d.estado === 'ACTIVO_CON_SALDO'
                  const waUrl = buildWhatsAppLink(
                    d.telefono,
                    negocio?.mensaje_whatsapp_personalizado,
                    d,
                    negocio
                  )
                  return (
                    <div
                      key={d.id}
                      className={`bg-slate-900 border-2 rounded-3xl p-4 shadow-lg ${
                        esSoloSaldo ? 'border-amber-400/40' : 'border-red-500/35'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider mb-1 ${
                              esSoloSaldo
                                ? 'bg-amber-400/20 text-amber-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {esSoloSaldo
                              ? `ACTIVO · DEBE ${formatCOP(d.saldo_pendiente)} DE SALDO`
                              : d.estado === 'SIN_CLASES'
                              ? '0 CLASES RESTANTES'
                              : 'MENSUALIDAD VENCIDA'}
                          </span>
                          <h3 className="text-lg font-black">{d.nombre}</h3>
                          <p className="text-xs text-slate-400">
                            {d.plan_nombre} · Cel: {d.telefono}
                          </p>
                          <p
                            className={`text-xs font-semibold mt-1 ${
                              esSoloSaldo ? 'text-amber-300' : 'text-red-300'
                            }`}
                          >
                            {d.motivo_deuda}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTogglePausaFicha(d)}
                            title="Pausar / Archivar alumno para que no salga en Deudores este mes"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1"
                          >
                            <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                            Pausar
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirFichaRapida(d)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                            Ficha
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => abrirFichaRapida(d)}
                          className={`w-full font-black text-sm py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg ${
                            esSoloSaldo
                              ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/20'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                          }`}
                        >
                          <RefreshCw className="w-4 h-4" />
                          {esSoloSaldo
                            ? `Recibir Abono (${formatCOP(d.saldo_pendiente)})`
                            : 'Registrar Pago / Abono'}
                        </button>

                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-sm py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Cobrar por WhatsApp
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ===============================================================
            VISTA 3: [+ NUEVO] Y DIRECTORIO (ACTIVOS vs PAUSADOS/ARCHIVADOS)
           =============================================================== */}
        {activeTab === 'nuevo' && (
          <div className="space-y-5">
            {usuarioRecienCreado && (
              <div className="bg-emerald-950/60 border-2 border-emerald-500 rounded-3xl p-5 text-center shadow-2xl">
                <span className="inline-block px-3 py-1 rounded-full bg-emerald-500 text-slate-950 text-xs font-black uppercase tracking-wider mb-2">
                  ¡CARNET QR CREADO CON ÉXITO!
                </span>
                <h3 className="text-xl font-black mb-1">{usuarioRecienCreado.nombre}</h3>
                <p className="text-xs text-emerald-300 mb-1">
                  {usuarioRecienCreado.plan_nombre}
                </p>
                {usuarioRecienCreado.saldo_pendiente > 0 && (
                  <p className="text-xs font-black text-amber-300 mb-3">
                    ⚠️ Quedó con Saldo Pendiente de {formatCOP(usuarioRecienCreado.saldo_pendiente)}
                  </p>
                )}

                <div className="bg-white p-3.5 rounded-2xl inline-block mx-auto mb-4 mt-2">
                  <QRCodeSVG value={usuarioRecienCreado.qr_token} size={150} level="H" />
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <a
                    href={buildWelcomeWhatsAppLink(usuarioRecienCreado, negocio)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Enviar Pase QR por WhatsApp
                  </a>
                  <a
                    href={`/pase/${usuarioRecienCreado.qr_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver Vista Pública del Alumno (/pase/{usuarioRecienCreado.qr_token})
                  </a>
                </div>
              </div>
            )}

            {/* Formulario de Inscripción Rápida con Método de Pago y Fiado */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
              <h2 className="text-xl font-black mb-1 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                Inscribir Nuevo Alumno
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Genera su QR al instante, registra cómo pagó (Efectivo/Nequi) y si dejó saldo pendiente.
              </p>

              <form onSubmit={handleCrearUsuario} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Nombre Completo del Alumno
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos Andrés Pérez"
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-base font-semibold text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    WhatsApp / Celular (con código de país, ej. 57...)
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. 573001234567"
                    value={nuevoTelefono}
                    onChange={(e) => setNuevoTelefono(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-base font-semibold text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Plan / Tiquetera
                    </label>
                    <button
                      type="button"
                      onClick={() => setMostrarConfigModal(true)}
                      className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Crear otro plan
                    </button>
                  </div>
                  <select
                    value={nuevoPlanId}
                    onChange={(e) => setNuevoPlanId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3.5 text-base font-semibold text-white focus:outline-none focus:border-emerald-500"
                  >
                    {planes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} —{' '}
                        {p.clases_totales
                          ? `${p.clases_totales} clases`
                          : 'Ilimitado'}{' '}
                        ({p.duracion_dias} días) · {formatCOP(p.precio)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Método de Pago y Saldo Pendiente ("El Fiado Colombiano") */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Método de Pago
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setNuevoMetodoPago('EFECTIVO')}
                        className={`py-3 rounded-xl text-xs font-black border ${
                          nuevoMetodoPago === 'EFECTIVO'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                            : 'bg-slate-950 text-slate-300 border-slate-700'
                        }`}
                      >
                        💵 Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setNuevoMetodoPago('NEQUI')}
                        className={`py-3 rounded-xl text-xs font-black border ${
                          nuevoMetodoPago === 'NEQUI'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                            : 'bg-slate-950 text-slate-300 border-slate-700'
                        }`}
                      >
                        📱 Nequi
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                      Saldo Pendiente (Fiado)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="5000"
                      value={nuevoSaldoPendiente}
                      onChange={(e) => setNuevoSaldoPendiente(e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-base font-black text-amber-300 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {errorCrearUsuario && (
                  <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-semibold p-3 rounded-2xl">
                    {errorCrearUsuario}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creandoUsuario}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-black text-lg py-4 rounded-2xl shadow-lg shadow-emerald-500/20 transition"
                >
                  {creandoUsuario ? 'Generando Pase QR...' : 'Crear Alumno y Generar QR'}
                </button>
              </form>
            </div>

            {/* Directorio Completo con Pestaña de Alumnos Activos y Alumnos Pausados/Archivados */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-base font-black flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Directorio del Club
                </h3>
                <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setFiltroDirectorio('activos')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition ${
                      filtroDirectorio === 'activos'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400'
                    }`}
                  >
                    Activos ({alumnosActivos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroDirectorio('pausados')}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition ${
                      filtroDirectorio === 'pausados'
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-400'
                    }`}
                  >
                    Pausados ({alumnosPausados.length})
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {(filtroDirectorio === 'activos' ? alumnosActivos : alumnosPausados).map((u) => (
                  <div
                    key={u.id}
                    className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-2"
                  >
                    <div
                      onClick={() => abrirFichaRapida(u)}
                      className="min-w-0 cursor-pointer flex-1"
                    >
                      <p className="font-bold text-sm truncate hover:underline">{u.nombre}</p>
                      <p className="text-xs text-slate-400">
                        {u.pausado ? (
                          <span className="text-amber-300 font-semibold">
                            ⏸️ INACTIVO (Pausado) · {u.pagos_registrados} pagos guardados
                          </span>
                        ) : (
                          <>
                            {u.plan_nombre} ·{' '}
                            {u.clases_restantes !== null
                              ? `${u.clases_restantes} clases`
                              : 'Ilimitado'}
                            {u.saldo_pendiente > 0
                              ? ` · Debe ${formatCOP(u.saldo_pendiente)}`
                              : ''}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => abrirFichaRapida(u)}
                        className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold flex items-center gap-1"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Ficha
                      </button>
                      <a
                        href={`/pase/${u.qr_token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-bold flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        QR
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =====================================================================
          MODAL DE PLANES Y MENSAJE WHATSAPP PERSONALIZADO DEL GIMNASIO
         ===================================================================== */}
      {mostrarConfigModal && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">Configuración del Club</h3>
              <button
                type="button"
                onClick={() => setMostrarConfigModal(false)}
                className="px-3 py-1 rounded-xl bg-slate-800 text-xs font-bold"
              >
                Cerrar ✕
              </button>
            </div>

            <form
              onSubmit={handleCrearPlan}
              className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800"
            >
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                + Agregar Plan o Tiquetera
              </h4>
              <input
                type="text"
                required
                placeholder="Nombre (ej. Tiquetera 8 Clases)"
                value={nuevoPlanNombre}
                onChange={(e) => setNuevoPlanNombre(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold"
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Clases (0=Mes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={nuevoPlanClases}
                    onChange={(e) => setNuevoPlanClases(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Vigencia Días
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={nuevoPlanDias}
                    onChange={(e) => setNuevoPlanDias(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Precio ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={nuevoPlanPrecio}
                    onChange={(e) => setNuevoPlanPrecio(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={guardandoConfig}
                className="w-full bg-emerald-500 text-slate-950 font-black text-xs py-2.5 rounded-xl"
              >
                Guardar Nuevo Plan
              </button>
            </form>

            <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Mensaje de Cobro WhatsApp Personalizado
              </h4>
              <p className="text-[11px] text-slate-400">
                Variables disponibles: <code>{'{nombre}'}</code>, <code>{'{gimnasio}'}</code>,{' '}
                <code>{'{plan}'}</code>, <code>{'{link_pase}'}</code>
              </p>
              <textarea
                rows={4}
                value={mensajeWhatsappEdit}
                onChange={(e) => setMensajeWhatsappEdit(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white"
              />
              <button
                type="button"
                disabled={guardandoConfig}
                onClick={handleGuardarMensajeWhatsapp}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2.5 rounded-xl"
              >
                Actualizar Mensaje de WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          BARRA INFERIOR FIJA CON LOS 3 BOTONES GIGANTES
         ===================================================================== */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur border-t border-slate-800 px-3 py-2">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('escanear')}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-2xl font-black text-sm transition active:scale-95 ${
              activeTab === 'escanear'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <QrCode className="w-6 h-6 mb-0.5" />
            <span>[Escanear]</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('deudores')}
            className={`relative flex flex-col items-center justify-center py-3 px-2 rounded-2xl font-black text-sm transition active:scale-95 ${
              activeTab === 'deudores'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <AlertTriangle className="w-6 h-6 mb-0.5" />
            <span>[Deudores]</span>
            {deudores.length > 0 && (
              <span
                className={`absolute top-1.5 right-3 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black flex items-center justify-center ${
                  activeTab === 'deudores'
                    ? 'bg-white text-red-600'
                    : 'bg-red-500 text-white'
                }`}
              >
                {deudores.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nuevo')}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-2xl font-black text-sm transition active:scale-95 ${
              activeTab === 'nuevo'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <UserPlus className="w-6 h-6 mb-0.5" />
            <span>[+ Nuevo]</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
