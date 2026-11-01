from datetime import datetime, date
import uuid
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class Negocio(Base):
    """
    Tabla Multi-Tenancy Ligero:
    Permite aislar clubes, gimnasios y entrenadores en una sola base de datos.
    """
    __tablename__ = "negocios"

    id = Column(Integer, primary_key=True, index=True)
    nombre_gimnasio = Column(String(120), nullable=False)
    telefono_admin = Column(String(30), unique=True, index=True, nullable=False)
    pin_acceso_admin = Column(String(10), nullable=False)
    mensaje_whatsapp_personalizado = Column(
        Text,
        nullable=False,
        default="Hola {nombre} 👋, te escribimos de *{gimnasio}*. Tu plan se encuentra vencido o con saldo pendiente. Renueva tu membresía para seguir entrenando 💪. Mira tu pase aquí: {link_pase}"
    )
    creado_en = Column(DateTime, default=datetime.utcnow)

    planes = relationship("Plan", back_populates="negocio", cascade="all, delete-orphan")
    usuarios = relationship("Usuario", back_populates="negocio", cascade="all, delete-orphan")


class Plan(Base):
    """
    Planes ofrecidos por cada Negocio (mensualidades por días o tiqueteras por número de clases).
    """
    __tablename__ = "planes"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, ForeignKey("negocios.id"), index=True, nullable=False)
    nombre = Column(String(100), nullable=False)
    # Si clases_totales es None o 0, el plan es ilimitado durante duracion_dias (ej. Mensualidad libre).
    # Si clases_totales > 0, es una tiquetera que descuenta 1 clase por cada escaneo QR.
    clases_totales = Column(Integer, nullable=True)
    duracion_dias = Column(Integer, nullable=False, default=30)
    precio = Column(Float, nullable=False, default=0.0)
    activo = Column(Boolean, default=True)

    negocio = relationship("Negocio", back_populates="planes")
    usuarios = relationship("Usuario", back_populates="plan")


class Usuario(Base):
    """
    Alumnos / Clientes inscritos en un Negocio específico.
    Incluye soporte para:
    - Pausar / Archivar alumno (pausado=True -> Estado INACTIVO, no sale en Deudores y bloquea QR)
    - Abonos parciales / "El Fiado Colombiano" (saldo_pendiente > 0 -> Escáner en AMARILLO)
    """
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, ForeignKey("negocios.id"), index=True, nullable=False)
    plan_id = Column(Integer, ForeignKey("planes.id"), nullable=True)

    nombre = Column(String(120), nullable=False)
    telefono = Column(String(30), nullable=False)
    qr_token = Column(String(64), unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))

    # None = acceso ilimitado mientras fecha_vencimiento >= hoy
    clases_restantes = Column(Integer, nullable=True)
    fecha_vencimiento = Column(Date, nullable=False, default=date.today)

    # Nuevas funciones de vida real:
    pausado = Column(Boolean, default=False, nullable=False)  # True = INACTIVO (Pausado / Archivado)
    saldo_pendiente = Column(Float, default=0.0, nullable=False)  # > 0 = Debe saldo ("El Fiado Colombiano")

    ultimo_escaneo = Column(DateTime, nullable=True)
    creado_en = Column(DateTime, default=datetime.utcnow)

    negocio = relationship("Negocio", back_populates="usuarios")
    plan = relationship("Plan", back_populates="usuarios")
    asistencias = relationship("HistorialAsistencia", back_populates="usuario", cascade="all, delete-orphan")
    pagos = relationship("HistorialPago", back_populates="usuario", cascade="all, delete-orphan")


class HistorialAsistencia(Base):
    """
    Registro de cada lectura QR en cancha/recepción.
    """
    __tablename__ = "asistencias"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, ForeignKey("negocios.id"), index=True, nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), index=True, nullable=False)
    fecha_hora = Column(DateTime, default=datetime.utcnow, nullable=False)
    estado_resultado = Column(String(15), nullable=False)  # "VERDE" | "AMARILLO" | "ROJO"
    detalle = Column(String(255), nullable=False)

    usuario = relationship("Usuario", back_populates="asistencias")


class HistorialPago(Base):
    """
    Registro de pagos, abonos parciales y renovaciones de planes (con método Efectivo / Nequi).
    """
    __tablename__ = "pagos"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, ForeignKey("negocios.id"), index=True, nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), index=True, nullable=False)
    plan_id = Column(Integer, ForeignKey("planes.id"), nullable=True)
    monto = Column(Float, nullable=False, default=0.0)
    metodo_pago = Column(String(30), nullable=False, default="EFECTIVO")  # "EFECTIVO" | "NEQUI"
    tipo_pago = Column(String(30), nullable=False, default="RENOVACION")  # "INSCRIPCION" | "RENOVACION" | "ABONO_SALDO"
    fecha_hora = Column(DateTime, default=datetime.utcnow, nullable=False)

    usuario = relationship("Usuario", back_populates="pagos")
