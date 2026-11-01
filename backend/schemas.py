from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# --- Auth & Negocio ---
class LoginRequest(BaseModel):
    telefono: str = Field(..., description="Número de celular del entrenador/administrador")
    pin: str = Field(..., min_length=4, max_length=10, description="PIN de 4 dígitos")


class RegisterNegocioRequest(BaseModel):
    nombre_gimnasio: str = Field(..., min_length=2, max_length=120)
    telefono_admin: str = Field(..., min_length=6, max_length=30)
    pin_acceso_admin: str = Field(..., min_length=4, max_length=10)
    mensaje_whatsapp_personalizado: Optional[str] = None


class UpdateNegocioConfigRequest(BaseModel):
    nombre_gimnasio: Optional[str] = None
    pin_acceso_admin: Optional[str] = None
    mensaje_whatsapp_personalizado: Optional[str] = None


class NegocioResponse(BaseModel):
    id: int
    nombre_gimnasio: str
    telefono_admin: str
    mensaje_whatsapp_personalizado: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_days: int = 30
    negocio: NegocioResponse


# --- Planes ---
class PlanCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    clases_totales: Optional[int] = Field(None, description="Null o 0 para mensualidad ilimitada; >0 para tiquetera")
    duracion_dias: int = Field(30, ge=1, le=365)
    precio: float = Field(0.0, ge=0)


class PlanResponse(BaseModel):
    id: int
    negocio_id: int
    nombre: str
    clases_totales: Optional[int]
    duracion_dias: int
    precio: float
    activo: bool

    class Config:
        from_attributes = True


# --- Usuarios (Alumnos) & Ficha Rápida ---
class UsuarioCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    telefono: str = Field(..., min_length=6, max_length=30)
    plan_id: int
    metodo_pago: str = Field("EFECTIVO", description="EFECTIVO o NEQUI")
    saldo_pendiente: float = Field(0.0, ge=0, description="Saldo pendiente si el alumno hizo un abono parcial")


class RegistrarPagoRequest(BaseModel):
    plan_id: Optional[int] = Field(None, description="Si no se envía, renueva el plan actual del alumno")
    metodo_pago: str = Field("EFECTIVO", description="EFECTIVO o NEQUI")
    saldo_pendiente: float = Field(0.0, ge=0, description="Saldo que el alumno queda debiendo ('El Fiado Colombiano')")


class AbonarSaldoRequest(BaseModel):
    monto_abono: float = Field(..., gt=0, description="Monto que el alumno abona hoy para bajar su saldo pendiente")
    metodo_pago: str = Field("EFECTIVO", description="EFECTIVO o NEQUI")


class CongelarDiasRequest(BaseModel):
    dias: int = Field(..., ge=1, le=180, description="Días a sumar a fecha_vencimiento por incapacidad o viaje (+7, +15)")


class TogglePausaRequest(BaseModel):
    pausado: Optional[bool] = Field(None, description="True para pausar/archivar (INACTIVO), False para reactivar")


class UsuarioDetailResponse(BaseModel):
    id: int
    negocio_id: int
    plan_id: Optional[int]
    plan_nombre: str
    plan_precio: float
    nombre: str
    telefono: str
    qr_token: str
    clases_restantes: Optional[int]
    clases_totales: Optional[int]
    fecha_vencimiento: date
    dias_restantes: int
    pausado: bool
    saldo_pendiente: float
    estado: str  # "ACTIVO" | "ACTIVO_CON_SALDO" | "VENCIDO" | "SIN_CLASES" | "INACTIVO"
    es_deudor: bool
    motivo_deuda: Optional[str] = None
    ultimo_escaneo: Optional[datetime] = None
    pagos_registrados: int = 0


# --- Resumen de Caja del Día (Cintilla Superior) ---
class ResumenCajaDiaResponse(BaseModel):
    asistencias_hoy: int
    recaudado_hoy: float
    efectivo_hoy: float
    nequi_hoy: float


# --- Escaneo QR (/api/scan) ---
class ScanRequest(BaseModel):
    qr_token: str = Field(..., description="Token QR o URL completa del pase del alumno")
    forzar_doble_escaneo: bool = Field(False, description="Si es True, ignora la protección anti-rebote de 12s")


class ScanResponse(BaseModel):
    status: str  # "VERDE" | "AMARILLO" | "ROJO"
    titulo: str
    mensaje: str
    motivo: Optional[str] = None
    alerta_doble_escaneo: bool = False
    usuario: Optional[UsuarioDetailResponse] = None


# --- Vista Pública del Pase (/pase/:qr_token) ---
class PasePublicoResponse(BaseModel):
    qr_token: str
    nombre_alumno: str
    nombre_gimnasio: str
    plan_nombre: str
    estado: str  # "ACTIVO" | "ACTIVO_CON_SALDO" | "VENCIDO" | "SIN_CLASES" | "INACTIVO"
    estado_color: str  # "VERDE" | "AMARILLO" | "ROJO" | "GRIS"
    pausado: bool
    saldo_pendiente: float
    clases_restantes: Optional[int]
    clases_totales: Optional[int]
    fecha_vencimiento: date
    dias_restantes: int
    ultimo_escaneo: Optional[datetime] = None
