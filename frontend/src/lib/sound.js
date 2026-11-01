/**
 * Feedback Sensorial de Cancha (Fase 2 + Abonos Parciales):
 * - Si es VERDE: Dispara new Audio('/beep-ok.mp3').play() + refuerzo acústico Web Audio API
 * - Si es AMARILLO (Activo pero debe saldo): Dispara new Audio('/beep-ok.mp3').play() + doble tono de atención + vibración media
 * - Si es ROJO: Dispara navigator.vibrate([300, 100, 300]) + alerta grave acústica
 */

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

export function triggerSuccessFeedback() {
  try {
    const audio = new Audio('/beep-ok.mp3')
    audio.volume = 1.0
    audio.play().catch(() => {})
  } catch {
    // Ignore
  }

  try {
    const ctx = getAudioContext()
    if (ctx) {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1046.5, now)
      osc.frequency.setValueAtTime(1318.5, now + 0.1)
      gain.gain.setValueAtTime(0.35, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.35)
    }
  } catch {
    // Ignore
  }

  try {
    if (navigator.vibrate) {
      navigator.vibrate(80)
    }
  } catch {
    // Ignore
  }
}

export function triggerWarningFeedback() {
  // Feedback para pantalla AMARILLA ("Activo - PERO DEBE SALDO")
  try {
    const audio = new Audio('/beep-ok.mp3')
    audio.volume = 1.0
    audio.play().catch(() => {})
  } catch {
    // Ignore
  }

  try {
    const ctx = getAudioContext()
    if (ctx) {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(784.0, now) // Sol5
      osc.frequency.setValueAtTime(587.3, now + 0.14) // Re5
      osc.frequency.setValueAtTime(784.0, now + 0.28) // Sol5
      gain.gain.setValueAtTime(0.4, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.45)
    }
  } catch {
    // Ignore
  }

  try {
    if (navigator.vibrate) {
      navigator.vibrate([160, 80, 160])
    }
  } catch {
    // Ignore
  }
}

export function triggerErrorFeedback() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300])
    }
  } catch {
    // Ignore
  }

  try {
    const audio = new Audio('/beep-error.mp3')
    audio.volume = 1.0
    audio.play().catch(() => {})
  } catch {
    // Ignore
  }

  try {
    const ctx = getAudioContext()
    if (ctx) {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, now)
      osc.frequency.setValueAtTime(130, now + 0.22)
      gain.gain.setValueAtTime(0.4, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.55)
    }
  } catch {
    // Ignore
  }
}
