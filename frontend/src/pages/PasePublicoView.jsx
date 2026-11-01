import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, formatCOP } from '../lib/api.js'

export default function PasePublicoView() {
  const { qr_token } = useParams()
  const [pase, setPase] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    async function cargarPase() {
      try {
        setLoading(true)
        const data = await api.getPasePublico(qr_token)
        if (mounted) {
          setPase(data)
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || 'No se pudo cargar el pase.')
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    cargarPase()
    const interval = setInterval(cargarPase, 6000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [qr_token])

  if (loading && !pase) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-3xl p-8 text-center shadow-2xl animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-2/3 mx-auto mb-6" />
          <div className="w-56 h-56 bg-slate-200 rounded-2xl mx-auto mb-6" />
          <div className="h-10 bg-slate-200 rounded-xl w-full mb-4" />
          <div className="h-16 bg-slate-200 rounded-xl w-full" />
        </div>
      </div>
    )
  }

  if (error || !pase) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white text-slate-900 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-3xl font-black">
            !
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-2">PASE NO ENCONTRADO</h1>
          <p className="text-slate-600 text-sm">{error || 'Este código QR no es válido.'}</p>
        </div>
      </div>
    )
  }

  let badgeClass = 'bg-red-600 text-white shadow-red-600/25'
  let textoEstado = 'VENCIDO'

  if (pase.estado === 'ACTIVO') {
    badgeClass = 'bg-emerald-500 text-white shadow-emerald-500/25'
    textoEstado = 'ACTIVO'
  } else if (pase.estado === 'ACTIVO_CON_SALDO') {
    badgeClass = 'bg-amber-400 text-slate-950 shadow-amber-400/30'
    textoEstado = `ACTIVO · DEBE ${formatCOP(pase.saldo_pendiente)}`
  } else if (pase.estado === 'INACTIVO') {
    badgeClass = 'bg-slate-600 text-white'
    textoEstado = 'PAUSADO / INACTIVO'
  } else if (pase.estado === 'SIN_CLASES') {
    badgeClass = 'bg-red-600 text-white shadow-red-600/25'
    textoEstado = 'SIN CLASES'
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-5 select-none">
      {/* Tarjeta Blanca Central - Cero botones de navegación */}
      <div className="w-full max-w-sm bg-white text-slate-900 rounded-[2rem] shadow-[0_25px_70px_rgba(0,0,0,0.75)] overflow-hidden border-4 border-white">
        {/* Encabezado del Gimnasio / Club */}
        <div className="bg-slate-900 text-white px-6 py-4 text-center">
          <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400 font-bold">
            PASE DIGITAL DE ACCESO
          </p>
          <h2 className="text-lg font-extrabold tracking-tight truncate mt-0.5">
            {pase.nombre_gimnasio}
          </h2>
        </div>

        <div className="p-6 flex flex-col items-center">
          {/* Código QR de alto contraste para lectura rápida en cancha */}
          <div
            className={`bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-inner mb-5 ${
              pase.pausado ? 'opacity-40 grayscale' : ''
            }`}
          >
            <QRCodeSVG
              value={pase.qr_token}
              size={220}
              level="H"
              includeMargin={false}
              bgColor="#FFFFFF"
              fgColor="#0f172a"
            />
          </div>

          {/* Nombre del Alumno */}
          <h1 className="text-2xl font-black text-slate-900 text-center leading-tight mb-1">
            {pase.nombre_alumno}
          </h1>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">
            {pase.plan_nombre}
          </p>

          {/* Estado en GRANDE */}
          <div
            className={`w-full py-3.5 px-4 rounded-2xl text-center font-black text-xl tracking-wide shadow-sm mb-5 ${badgeClass}`}
          >
            {textoEstado}
          </div>

          {/* Contadores Gigantes: Clases y Días Restantes */}
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-slate-100 rounded-2xl p-3.5 text-center border border-slate-200">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Clases Restantes
              </span>
              {pase.clases_restantes !== null && pase.clases_restantes !== undefined ? (
                <span
                  className={`block text-3xl font-black mt-1 ${
                    pase.clases_restantes > 0 ? 'text-slate-900' : 'text-red-600'
                  }`}
                >
                  {pase.clases_restantes}
                  {pase.clases_totales ? (
                    <span className="text-base font-bold text-slate-400">
                      /{pase.clases_totales}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="block text-xl font-black text-emerald-700 mt-2">
                  ILIMITADAS
                </span>
              )}
            </div>

            <div className="bg-slate-100 rounded-2xl p-3.5 text-center border border-slate-200">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {pase.dias_restantes >= 0 ? 'Días Restantes' : 'Días Vencido'}
              </span>
              <span
                className={`block text-3xl font-black mt-1 ${
                  pase.dias_restantes >= 0 ? 'text-slate-900' : 'text-red-600'
                }`}
              >
                {Math.abs(pase.dias_restantes)}
              </span>
            </div>
          </div>

          {/* Fecha de vencimiento */}
          <p className="text-xs text-slate-400 font-medium mt-4">
            Vence: {pase.fecha_vencimiento}
          </p>
        </div>
      </div>
    </div>
  )
}
