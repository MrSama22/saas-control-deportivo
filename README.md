# TrainPass QR — SaaS Multi-Gimnasio de Control de Mensualidades y Tiqueteras

Implementación completa de **Arquitectura de Producción** dividida en las 4 fases:

---

## Estructura del Proyecto

- **`backend/` (Fase 1 - Motor Backend & Seguridad Multi-Tenant)**
  - `models.py`: Tablas `Negocio` (`id`, `nombre_gimnasio`, `telefono_admin`, `pin_acceso_admin`, `mensaje_whatsapp_personalizado`), `Plan`, `Usuario`, `HistorialAsistencia` y `HistorialPago`, todas aisladas por `negocio_id`.
  - `auth.py`: Autenticación ultra-simple (`POST /api/auth/login`) con celular + PIN de 4 dígitos que emite un **JWT válido por 30 días** para guardar en el `localStorage` del celular.
  - `main.py`: Endpoints `/api/auth/login`, `/api/scan`, `/api/deudores`, `/api/usuarios`, `/api/usuarios/{id}/pagar` (*Registrar Pago Ahora*), `/api/planes` y `/api/pase/{qr_token}`.
  - `seed.py`: Datos reales precargados para 2 clubes independientes (**Academia Voleibol Titanes** y **Club de Boxeo La Roca**) para probar el aislamiento Multi-Tenant y salir a hacer la prueba de campo de la **Fase 4**.

- **`frontend/` (Fase 2 - Mobile-First React + Vite + TailwindCSS + Escáner & Feedback Sensorial)**
  - **`/admin` (`src/pages/AdminView.jsx`)**:
    - Protegida por PIN de 4 dígitos (`localStorage` por 30 días).
    - Barra inferior fija con los 3 botones gigantes: **`[Escanear]`**, **`[Deudores]`** y **`[+ Nuevo]`**.
    - Lector `html5-qrcode` configurado con cámara trasera (`facingMode: "environment"`).
    - **Feedback Sensorial de Cancha**:
      - **VERDE**: Dispara `new Audio('/beep-ok.mp3').play()` + refuerzo acústico Web Audio API y pinta toda la pantalla de **verde esmeralda durante 2.5 segundos** con letras gigantes.
      - **ROJO**: Dispara `navigator.vibrate([300, 100, 300])` + alerta grave y pinta toda la pantalla de **rojo** mostrando el botón gigante **"Registrar Pago Ahora"**.
  - **`/pase/:qr_token` (`src/pages/PasePublicoView.jsx`)**:
    - Vista pública del alumno con **cero botones de navegación**, fondo oscuro (`bg-slate-950`), tarjeta blanca centrada con el código QR (`qrcode.react`), nombre, estado en grande y contadores de clases/días restantes.

---

## Cuentas Demo Precargadas (Listas para probar)

| Gimnasio / Club | Celular Entrenador | PIN (4 dígitos) | Alumnos de Prueba |
| :--- | :--- | :--- | :--- |
| **Academia Voleibol Titanes** | `3001234567` | `1234` | • **Valentina Gómez** (`/pase/pase-valentina-activo`) — Activa (8 clases)<br>• **Sebastián Morales** (`/pase/pase-sebastian-ultima`) — Activo (1 última clase)<br>• **Mateo Rodríguez** (`/pase/pase-mateo-sin-clases`) — Rojo (0 clases)<br>• **Camila Herrera** (`/pase/pase-camila-vencida`) — Rojo (Mensualidad vencida) |
| **Club de Boxeo La Roca** | `3109876543` | `9999` | • **Andrés 'El Toro' Castro** (`/pase/pase-boxeo-andres`) — Activo (6 clases)<br>• **Laura Méndez** (`/pase/pase-boxeo-laura-vencida`) — Rojo (Vencida) |

---

## Fase 3: Cómo usar el Túnel HTTPS para probar la cámara desde tu iPhone o Android

Como el proxy de Vite (`frontend/vite.config.js`) ya redirige automáticamente `/api` hacia FastAPI (`127.0.0.1:8000`), **solo necesitas exponer el puerto `5173` con HTTPS**:

```powershell
# Opción 1: Cloudflare Tunnel (Sin cuenta, gratis e instantáneo)
npx cloudflared tunnel --url http://localhost:5173

# Opción 2: ngrok
ngrok http 5173
```

Abre el link `https://xxxx.trycloudflare.com/admin` en tu celular y Safari/Chrome te dará acceso total a la cámara trasera.
