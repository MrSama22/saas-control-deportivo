from datetime import date, datetime, timedelta
from typing import List
import uuid

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from database import engine, Base, get_db, SessionLocal
from models import Negocio, Plan, Usuario, HistorialAsistencia, HistorialPago
from schemas import (
    LoginRequest,
    RegisterNegocioRequest,
    UpdateNegocioConfigRequest,
    NegocioResponse,
    TokenResponse,
    PlanCreate,
    PlanResponse,
    UsuarioCreate,
    RegistrarPagoRequest,
    AbonarSaldoRequest,
    CongelarDiasRequest,
    TogglePausaRequest,
    UsuarioDetailResponse,
    ResumenCajaDiaResponse,
    ScanRequest,
    ScanResponse,
    PasePublicoResponse,
)
from auth import create_access_token, get_current_negocio
from seed import seed_initial_data

# Crear tablas automáticamente en SQLite o PostgreSQL
Base.metadata.create_all(bind=engine)


def ensure_schema_columns():
    """
    Migración ligera automática para agregar las columnas nuevas si la base de datos ya existía.
    """
    alter_statements = [
        "ALTER TABLE usuarios ADD COLUMN pausado BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE usuarios ADD COLUMN saldo_pendiente FLOAT NOT NULL DEFAULT 0.0",
        "ALTER TABLE pagos ADD COLUMN metodo_pago VARCHAR(30) NOT NULL DEFAULT 'EFECTIVO'",
        "ALTER TABLE pagos ADD COLUMN tipo_pago VARCHAR(30) NOT NULL DEFAULT 'RENOVACION'",
    ]
    with engine.begin() as conn:
        for stmt in alter_statements:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass


ensure_schema_columns()

app = FastAPI(
    title="TrainApp SaaS API - Control de Mensualidades y Tiqueteras por QR",
    version="2.0.0",
    description="Backend Multi-Tenant con FastAPI, JWT de 30 días, Pausar/Archivar, Abonos Parciales (Fiado), Congelar Días y Caja del Día.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()


def format_cop(valor: float) -> str:
    return f"${int(round(valor)):,}".replace(",", ".")


# =====================================================================
# HELPERS DE CÁLCULO DE ESTADO DE USUARIO
# =====================================================================
def build_usuario_detail(usuario: Usuario) -> UsuarioDetailResponse:
    hoy = date.today()
    dias_restantes = (usuario.fecha_vencimiento - hoy).days
    plan_nombre = usuario.plan.nombre if usuario.plan else "Sin Plan Asignado"
    plan_precio = usuario.plan.precio if usuario.plan else 0.0
    clases_totales = usuario.plan.clases_totales if usuario.plan else None
    saldo = float(usuario.saldo_pendiente or 0.0)
    pagos_count = len(usuario.pagos) if usuario.pagos is not None else 0

    # 1. Si está PAUSADO / ARCHIVADO -> Estado INACTIVO y NO sale en Deudores
    if usuario.pausado:
        estado = "INACTIVO"
        es_deudor = False
        motivo_deuda = "Alumno Pausado / Archivado (QR bloqueado temporalmente)"
    # 2. Si está vencido por fecha
    elif dias_restantes < 0:
        estado = "VENCIDO"
        es_deudor = True
        dias_vencido = abs(dias_restantes)
        motivo_deuda = f"Vencido hace {dias_vencido} {'día' if dias_vencido == 1 else 'días'}"
        if saldo > 0:
            motivo_deuda += f" · Además debe {format_cop(saldo)} de saldo"
    # 3. Si agotó las clases de su tiquetera
    elif usuario.clases_restantes is not None and usuario.clases_restantes <= 0:
        estado = "SIN_CLASES"
        es_deudor = True
        motivo_deuda = "Agotó todas las clases de su tiquetera (0 restantes)"
        if saldo > 0:
            motivo_deuda += f" · Además debe {format_cop(saldo)} de saldo"
    # 4. Está activo en clases/días, pero tiene saldo pendiente ("El Fiado Colombiano")
    elif saldo > 0:
        estado = "ACTIVO_CON_SALDO"
        es_deudor = True
        motivo_deuda = f"Activo en cancha · Debe {format_cop(saldo)} de saldo pendiente"
    # 5. Al día 100%
    else:
        estado = "ACTIVO"
        es_deudor = False
        motivo_deuda = None

    return UsuarioDetailResponse(
        id=usuario.id,
        negocio_id=usuario.negocio_id,
        plan_id=usuario.plan_id,
        plan_nombre=plan_nombre,
        plan_precio=plan_precio,
        nombre=usuario.nombre,
        telefono=usuario.telefono,
        qr_token=usuario.qr_token,
        clases_restantes=usuario.clases_restantes,
        clases_totales=clases_totales,
        fecha_vencimiento=usuario.fecha_vencimiento,
        dias_restantes=dias_restantes,
        pausado=bool(usuario.pausado),
        saldo_pendiente=saldo,
        estado=estado,
        es_deudor=es_deudor,
        motivo_deuda=motivo_deuda,
        ultimo_escaneo=usuario.ultimo_escaneo,
        pagos_registrados=pagos_count,
    )


def clean_qr_token(raw_input: str) -> str:
    cleaned = raw_input.strip()
    if "/pase/" in cleaned:
        cleaned = cleaned.split("/pase/")[-1].split("?")[0].split("#")[0].strip("/")
    return cleaned


# =====================================================================
# 1. AUTENTICACIÓN ULTRA-SIMPLE (PIN + CELULAR -> JWT 30 DÍAS)
# =====================================================================
@app.post("/api/auth/login", response_model=TokenResponse)
def login_entrenador(payload: LoginRequest, db: Session = Depends(get_db)):
    telefono_limpio = payload.telefono.strip().replace(" ", "").replace("-", "")
    pin_limpio = payload.pin.strip()

    negocio = (
        db.query(Negocio)
        .filter(Negocio.telefono_admin == telefono_limpio)
        .first()
    )
    if not negocio or negocio.pin_acceso_admin != pin_limpio:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Número de celular o PIN de 4 dígitos incorrecto.",
        )

    token = create_access_token(negocio_id=negocio.id, telefono=negocio.telefono_admin)
    return TokenResponse(
        access_token=token,
        expires_in_days=30,
        negocio=NegocioResponse.model_validate(negocio),
    )


@app.post("/api/auth/register", response_model=TokenResponse)
def registrar_nuevo_negocio(payload: RegisterNegocioRequest, db: Session = Depends(get_db)):
    telefono_limpio = payload.telefono_admin.strip().replace(" ", "").replace("-", "")
    existente = db.query(Negocio).filter(Negocio.telefono_admin == telefono_limpio).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un gimnasio/club registrado con ese número de celular.",
        )

    mensaje_default = (
        payload.mensaje_whatsapp_personalizado
        or "Hola {nombre} 👋, te escribimos de *{gimnasio}*. Tu plan ({plan}) se encuentra vencido o con saldo pendiente. Renueva tu membresía para seguir entrenando 💪. Mira tu pase aquí: {link_pase}"
    )

    nuevo_negocio = Negocio(
        nombre_gimnasio=payload.nombre_gimnasio.strip(),
        telefono_admin=telefono_limpio,
        pin_acceso_admin=payload.pin_acceso_admin.strip(),
        mensaje_whatsapp_personalizado=mensaje_default,
    )
    db.add(nuevo_negocio)
    db.flush()

    plan_tiquetera = Plan(
        negocio_id=nuevo_negocio.id,
        nombre="Tiquetera 12 Clases",
        clases_totales=12,
        duracion_dias=30,
        precio=80000,
    )
    plan_mensual = Plan(
        negocio_id=nuevo_negocio.id,
        nombre="Mensualidad Ilimitada",
        clases_totales=None,
        duracion_dias=30,
        precio=120000,
    )
    db.add_all([plan_tiquetera, plan_mensual])
    db.commit()
    db.refresh(nuevo_negocio)

    token = create_access_token(negocio_id=nuevo_negocio.id, telefono=nuevo_negocio.telefono_admin)
    return TokenResponse(
        access_token=token,
        expires_in_days=30,
        negocio=NegocioResponse.model_validate(nuevo_negocio),
    )


@app.get("/api/auth/demo-accounts")
def listar_cuentas_demo(db: Session = Depends(get_db)):
    negocios = db.query(Negocio).order_by(Negocio.id.asc()).limit(5).all()
    return [
        {
            "id": n.id,
            "nombre_gimnasio": n.nombre_gimnasio,
            "telefono_admin": n.telefono_admin,
            "pin_demo": n.pin_acceso_admin,
        }
        for n in negocios
    ]


@app.get("/api/auth/me", response_model=NegocioResponse)
def obtener_mi_negocio(negocio: Negocio = Depends(get_current_negocio)):
    return NegocioResponse.model_validate(negocio)


@app.put("/api/negocio/config", response_model=NegocioResponse)
def actualizar_configuracion_negocio(
    payload: UpdateNegocioConfigRequest,
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    if payload.nombre_gimnasio is not None and payload.nombre_gimnasio.strip():
        negocio.nombre_gimnasio = payload.nombre_gimnasio.strip()
    if payload.pin_acceso_admin is not None and len(payload.pin_acceso_admin.strip()) >= 4:
        negocio.pin_acceso_admin = payload.pin_acceso_admin.strip()
    if payload.mensaje_whatsapp_personalizado is not None and payload.mensaje_whatsapp_personalizado.strip():
        negocio.mensaje_whatsapp_personalizado = payload.mensaje_whatsapp_personalizado.strip()

    db.commit()
    db.refresh(negocio)
    return NegocioResponse.model_validate(negocio)


# =====================================================================
# 2. RESUMEN DE CAJA DEL DÍA (CINTILLA SUPERIOR PARA EL DUEÑO)
# =====================================================================
@app.get("/api/caja/resumen-hoy", response_model=ResumenCajaDiaResponse)
def obtener_resumen_caja_hoy(
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    """
    Devuelve:
    - Hoy asistieron: conteo de entradas permitidas hoy (VERDE y AMARILLO)
    - Recaudado hoy: suma total de pagos/abonos hoy (desglosado en Efectivo y Nequi)
    """
    hoy = date.today()
    inicio_dia = datetime(hoy.year, hoy.month, hoy.day, 0, 0, 0)

    asistencias_hoy = (
        db.query(HistorialAsistencia)
        .filter(
            HistorialAsistencia.negocio_id == negocio.id,
            HistorialAsistencia.fecha_hora >= inicio_dia,
            HistorialAsistencia.estado_resultado.in_(["VERDE", "AMARILLO"]),
        )
        .count()
    )

    pagos_hoy = (
        db.query(HistorialPago)
        .filter(
            HistorialPago.negocio_id == negocio.id,
            HistorialPago.fecha_hora >= inicio_dia,
        )
        .all()
    )

    efectivo_hoy = sum(p.monto for p in pagos_hoy if (p.metodo_pago or "").upper() == "EFECTIVO")
    nequi_hoy = sum(p.monto for p in pagos_hoy if (p.metodo_pago or "").upper() != "EFECTIVO")
    recaudado_hoy = efectivo_hoy + nequi_hoy

    return ResumenCajaDiaResponse(
        asistencias_hoy=asistencias_hoy,
        recaudado_hoy=recaudado_hoy,
        efectivo_hoy=efectivo_hoy,
        nequi_hoy=nequi_hoy,
    )


# =====================================================================
# 3. ESCÁNER QR EN CANCHA (/api/scan) - VERDE / AMARILLO (FIADO) / ROJO
# =====================================================================
@app.post("/api/scan", response_model=ScanResponse)
def procesar_escaneo_qr(
    payload: ScanRequest,
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    token = clean_qr_token(payload.qr_token)
    usuario = db.query(Usuario).filter(Usuario.qr_token == token).first()

    if not usuario:
        return ScanResponse(
            status="ROJO",
            titulo="QR NO RECONOCIDO",
            mensaje="Este código QR no existe en el sistema.",
            motivo="Código QR inválido o eliminado",
            usuario=None,
        )

    # Protección Multi-Tenant
    if usuario.negocio_id != negocio.id:
        return ScanResponse(
            status="ROJO",
            titulo="ALUMNO DE OTRO CLUB",
            mensaje=f"Este carnet no pertenece a {negocio.nombre_gimnasio}.",
            motivo="Aislamiento Multi-Gimnasio: El QR pertenece a otra academia",
            usuario=None,
        )

    # 0) Validar si el alumno está PAUSADO / ARCHIVADO (Estado: INACTIVO)
    if usuario.pausado:
        return ScanResponse(
            status="ROJO",
            titulo="ALUMNO PAUSADO / INACTIVO",
            mensaje=f"{usuario.nombre} está en pausa temporal.",
            motivo="Su QR está bloqueado mientras está archivado. Reactívalo o registra su pago abajo.",
            usuario=build_usuario_detail(usuario),
        )

    ahora = datetime.utcnow()
    hoy = date.today()
    dias_restantes = (usuario.fecha_vencimiento - hoy).days
    saldo = float(usuario.saldo_pendiente or 0.0)

    # Protección anti-doble-escaneo accidental de cámara (12 segundos)
    if (
        not payload.forzar_doble_escaneo
        and usuario.ultimo_escaneo
        and (ahora - usuario.ultimo_escaneo).total_seconds() < 12
    ):
        detalle_actual = build_usuario_detail(usuario)
        status_actual = "AMARILLO" if saldo > 0 else "VERDE"
        titulo_actual = (
            f"ACTIVO - PERO DEBE {format_cop(saldo)} DE SALDO"
            if saldo > 0
            else "YA REGISTRADO HACE UNOS SEGUNDOS"
        )
        return ScanResponse(
            status=status_actual,
            titulo=titulo_actual,
            mensaje=f"{usuario.nombre} ya marcó entrada hace un momento (no se descontó doble clase).",
            motivo=None,
            alerta_doble_escaneo=True,
            usuario=detalle_actual,
        )

    # 1) Validar Fecha de Vencimiento
    if dias_restantes < 0:
        dias_vencido = abs(dias_restantes)
        motivo = f"Plan vencido hace {dias_vencido} {'día' if dias_vencido == 1 else 'días'} ({usuario.fecha_vencimiento.strftime('%d/%m/%Y')})"
        asistencia = HistorialAsistencia(
            negocio_id=negocio.id,
            usuario_id=usuario.id,
            fecha_hora=ahora,
            estado_resultado="ROJO",
            detalle=motivo,
        )
        db.add(asistencia)
        db.commit()
        return ScanResponse(
            status="ROJO",
            titulo="MENSUALIDAD VENCIDA",
            mensaje=f"{usuario.nombre} tiene el plan vencido.",
            motivo=motivo,
            usuario=build_usuario_detail(usuario),
        )

    # 2) Validar Clases Restantes (si es tiquetera)
    if usuario.clases_restantes is not None and usuario.clases_restantes <= 0:
        motivo = "Tiquetera agotada (0 clases disponibles)"
        asistencia = HistorialAsistencia(
            negocio_id=negocio.id,
            usuario_id=usuario.id,
            fecha_hora=ahora,
            estado_resultado="ROJO",
            detalle=motivo,
        )
        db.add(asistencia)
        db.commit()
        return ScanResponse(
            status="ROJO",
            titulo="SIN CLASES DISPONIBLES",
            mensaje=f"{usuario.nombre} agotó sus clases.",
            motivo=motivo,
            usuario=build_usuario_detail(usuario),
        )

    # 3) ACCESO PERMITIDO -> Descontar clase si aplica
    if usuario.clases_restantes is not None:
        usuario.clases_restantes -= 1
        resumen_acceso = f"Quedan {usuario.clases_restantes} {'clase' if usuario.clases_restantes == 1 else 'clases'} · {dias_restantes} días"
    else:
        resumen_acceso = f"Mensualidad activa · Quedan {dias_restantes} {'día' if dias_restantes == 1 else 'días'}"

    usuario.ultimo_escaneo = ahora

    # 3A) Si tiene Saldo Pendiente ("El Fiado Colombiano") -> Sale en AMARILLO
    if saldo > 0:
        saldo_texto = format_cop(saldo)
        asistencia = HistorialAsistencia(
            negocio_id=negocio.id,
            usuario_id=usuario.id,
            fecha_hora=ahora,
            estado_resultado="AMARILLO",
            detalle=f"{resumen_acceso} (Debe {saldo_texto} de saldo)",
        )
        db.add(asistencia)
        db.commit()
        db.refresh(usuario)

        return ScanResponse(
            status="AMARILLO",
            titulo=f"ACTIVO - PERO DEBE {saldo_texto} DE SALDO",
            mensaje=resumen_acceso,
            motivo=f"Recuerda cobrarle el saldo pendiente de {saldo_texto}",
            usuario=build_usuario_detail(usuario),
        )

    # 3B) Al día sin deuda -> Sale en VERDE ESMERALDA
    asistencia = HistorialAsistencia(
        negocio_id=negocio.id,
        usuario_id=usuario.id,
        fecha_hora=ahora,
        estado_resultado="VERDE",
        detalle=resumen_acceso,
    )
    db.add(asistencia)
    db.commit()
    db.refresh(usuario)

    return ScanResponse(
        status="VERDE",
        titulo="¡ACCESO PERMITIDO!",
        mensaje=resumen_acceso,
        motivo=None,
        usuario=build_usuario_detail(usuario),
    )


# =====================================================================
# 4. GESTIÓN DE ALUMNOS, FICHA RÁPIDA, PAUSA, CONGELAR DÍAS Y FIADO
# =====================================================================
@app.get("/api/usuarios", response_model=List[UsuarioDetailResponse])
def listar_usuarios(
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    usuarios = (
        db.query(Usuario)
        .filter(Usuario.negocio_id == negocio.id)
        .order_by(Usuario.pausado.asc(), Usuario.nombre.asc())
        .all()
    )
    return [build_usuario_detail(u) for u in usuarios]


@app.get("/api/deudores", response_model=List[UsuarioDetailResponse])
def listar_deudores(
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    """
    Lista únicamente a los alumnos activos que tienen mensualidad vencida, 0 clases o saldo pendiente.
    Los alumnos PAUSADOS / ARCHIVADOS (pausado=True) quedan excluidos automáticamente.
    """
    usuarios = (
        db.query(Usuario)
        .filter(Usuario.negocio_id == negocio.id, Usuario.pausado == False)
        .order_by(Usuario.fecha_vencimiento.asc())
        .all()
    )
    detalles = [build_usuario_detail(u) for u in usuarios]
    return [d for d in detalles if d.es_deudor]


@app.post("/api/usuarios", response_model=UsuarioDetailResponse, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    payload: UsuarioCreate,
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    plan = (
        db.query(Plan)
        .filter(Plan.id == payload.plan_id, Plan.negocio_id == negocio.id)
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El plan seleccionado no existe en tu gimnasio.",
        )

    hoy = date.today()
    clases_iniciales = plan.clases_totales if (plan.clases_totales and plan.clases_totales > 0) else None
    fecha_venc = hoy + timedelta(days=plan.duracion_dias)
    saldo_pend = max(0.0, float(payload.saldo_pendiente or 0.0))

    nuevo_usuario = Usuario(
        negocio_id=negocio.id,
        plan_id=plan.id,
        nombre=payload.nombre.strip(),
        telefono=payload.telefono.strip().replace(" ", "").replace("-", ""),
        qr_token=str(uuid.uuid4()),
        clases_restantes=clases_iniciales,
        fecha_vencimiento=fecha_venc,
        pausado=False,
        saldo_pendiente=saldo_pend,
    )
    db.add(nuevo_usuario)
    db.flush()

    # El monto que realmente entró a caja hoy es precio_plan - saldo_pendiente
    monto_recibido_hoy = max(0.0, float(plan.precio) - saldo_pend)
    if monto_recibido_hoy > 0:
        pago_inicial = HistorialPago(
            negocio_id=negocio.id,
            usuario_id=nuevo_usuario.id,
            plan_id=plan.id,
            monto=monto_recibido_hoy,
            metodo_pago=(payload.metodo_pago or "EFECTIVO").upper(),
            tipo_pago="INSCRIPCION",
        )
        db.add(pago_inicial)

    db.commit()
    db.refresh(nuevo_usuario)
    return build_usuario_detail(nuevo_usuario)


@app.post("/api/usuarios/{usuario_id}/pagar", response_model=UsuarioDetailResponse)
def registrar_pago_ahora(
    usuario_id: int,
    payload: RegistrarPagoRequest = RegistrarPagoRequest(),
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    """
    Renueva el plan del alumno (y lo reactiva si estaba pausado).
    Soporta 'El Fiado Colombiano': si deja saldo_pendiente > 0, registra en caja lo abonado hoy
    y guarda el saldo pendiente para alertar en AMARILLO al escanear.
    """
    usuario = (
        db.query(Usuario)
        .filter(Usuario.id == usuario_id, Usuario.negocio_id == negocio.id)
        .first()
    )
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alumno no encontrado en este gimnasio.",
        )

    target_plan_id = payload.plan_id or usuario.plan_id
    plan = (
        db.query(Plan)
        .filter(Plan.id == target_plan_id, Plan.negocio_id == negocio.id)
        .first()
    )
    if not plan:
        plan = db.query(Plan).filter(Plan.negocio_id == negocio.id).first()
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay planes configurados en el gimnasio.",
            )

    hoy = date.today()
    saldo_pend = max(0.0, float(payload.saldo_pendiente or 0.0))

    usuario.plan_id = plan.id
    usuario.pausado = False  # Si estaba archivado y paga, vuelve a estar activo automáticamente
    usuario.clases_restantes = plan.clases_totales if (plan.clases_totales and plan.clases_totales > 0) else None
    usuario.fecha_vencimiento = hoy + timedelta(days=plan.duracion_dias)
    usuario.saldo_pendiente = saldo_pend

    monto_recibido = max(0.0, float(plan.precio) - saldo_pend)
    if monto_recibido > 0:
        pago = HistorialPago(
            negocio_id=negocio.id,
            usuario_id=usuario.id,
            plan_id=plan.id,
            monto=monto_recibido,
            metodo_pago=(payload.metodo_pago or "EFECTIVO").upper(),
            tipo_pago="RENOVACION",
        )
        db.add(pago)

    db.commit()
    db.refresh(usuario)
    return build_usuario_detail(usuario)


@app.post("/api/usuarios/{usuario_id}/abonar", response_model=UsuarioDetailResponse)
def abonar_saldo_pendiente(
    usuario_id: int,
    payload: AbonarSaldoRequest,
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    """
    Cuando el alumno trae el resto de la plata el viernes (ej. los otros $40.000):
    descuenta del saldo_pendiente y suma el dinero a la Caja del Día (Efectivo o Nequi).
    """
    usuario = (
        db.query(Usuario)
        .filter(Usuario.id == usuario_id, Usuario.negocio_id == negocio.id)
        .first()
    )
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alumno no encontrado.")

    abono = float(payload.monto_abono)
    usuario.saldo_pendiente = max(0.0, float(usuario.saldo_pendiente or 0.0) - abono)

    pago = HistorialPago(
        negocio_id=negocio.id,
        usuario_id=usuario.id,
        plan_id=usuario.plan_id,
        monto=abono,
        metodo_pago=(payload.metodo_pago or "EFECTIVO").upper(),
        tipo_pago="ABONO_SALDO",
    )
    db.add(pago)
    db.commit()
    db.refresh(usuario)
    return build_usuario_detail(usuario)


@app.post("/api/usuarios/{usuario_id}/congelar-dias", response_model=UsuarioDetailResponse)
def congelar_sumar_dias_incapacidad(
    usuario_id: int,
    payload: CongelarDiasRequest,
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    """
    Botón '[+ Sumar días por incapacidad]' (+7 días / +15 días):
    Empuja la fecha_vencimiento hacia adelante sin cobrarle un pago nuevo.
    """
    usuario = (
        db.query(Usuario)
        .filter(Usuario.id == usuario_id, Usuario.negocio_id == negocio.id)
        .first()
    )
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alumno no encontrado.")

    hoy = date.today()
    base_date = usuario.fecha_vencimiento if usuario.fecha_vencimiento >= hoy else hoy
    usuario.fecha_vencimiento = base_date + timedelta(days=payload.dias)

    db.commit()
    db.refresh(usuario)
    return build_usuario_detail(usuario)


@app.post("/api/usuarios/{usuario_id}/pausar", response_model=UsuarioDetailResponse)
def pausar_o_reactivar_alumno(
    usuario_id: int,
    payload: TogglePausaRequest = TogglePausaRequest(),
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    """
    Interruptor 'Pausar / Archivar Alumno' (Estado: INACTIVO):
    - Lo saca de la lista de Deudores
    - Bloquea su QR mientras está de vacaciones o en exámenes
    - Conserva su historial de pagos, su WhatsApp y su mismo código QR para cuando regrese
    """
    usuario = (
        db.query(Usuario)
        .filter(Usuario.id == usuario_id, Usuario.negocio_id == negocio.id)
        .first()
    )
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alumno no encontrado.")

    if payload.pausado is None:
        usuario.pausado = not bool(usuario.pausado)
    else:
        usuario.pausado = bool(payload.pausado)

    db.commit()
    db.refresh(usuario)
    return build_usuario_detail(usuario)


# =====================================================================
# 5. GESTIÓN DE PLANES DEL NEGOCIO
# =====================================================================
@app.get("/api/planes", response_model=List[PlanResponse])
def listar_planes(
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    return (
        db.query(Plan)
        .filter(Plan.negocio_id == negocio.id, Plan.activo == True)
        .order_by(Plan.id.asc())
        .all()
    )


@app.post("/api/planes", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
def crear_plan(
    payload: PlanCreate,
    negocio: Negocio = Depends(get_current_negocio),
    db: Session = Depends(get_db),
):
    clases = payload.clases_totales if (payload.clases_totales and payload.clases_totales > 0) else None
    nuevo_plan = Plan(
        negocio_id=negocio.id,
        nombre=payload.nombre.strip(),
        clases_totales=clases,
        duracion_dias=payload.duracion_dias,
        precio=payload.precio,
        activo=True,
    )
    db.add(nuevo_plan)
    db.commit()
    db.refresh(nuevo_plan)
    return nuevo_plan


# =====================================================================
# 6. VISTA PÚBLICA DEL ALUMNO (/pase/:qr_token) - SIN LOGIN
# =====================================================================
@app.get("/api/pase/{qr_token}", response_model=PasePublicoResponse)
def obtener_pase_publico(qr_token: str, db: Session = Depends(get_db)):
    token = clean_qr_token(qr_token)
    usuario = db.query(Usuario).filter(Usuario.qr_token == token).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El pase solicitado no existe o fue eliminado.",
        )

    detalle = build_usuario_detail(usuario)
    if detalle.estado == "ACTIVO":
        estado_color = "VERDE"
    elif detalle.estado == "ACTIVO_CON_SALDO":
        estado_color = "AMARILLO"
    elif detalle.estado == "INACTIVO":
        estado_color = "GRIS"
    else:
        estado_color = "ROJO"

    return PasePublicoResponse(
        qr_token=usuario.qr_token,
        nombre_alumno=usuario.nombre,
        nombre_gimnasio=usuario.negocio.nombre_gimnasio if usuario.negocio else "Club Deportivo",
        plan_nombre=detalle.plan_nombre,
        estado=detalle.estado,
        estado_color=estado_color,
        pausado=bool(usuario.pausado),
        saldo_pendiente=float(usuario.saldo_pendiente or 0.0),
        clases_restantes=usuario.clases_restantes,
        clases_totales=detalle.clases_totales,
        fecha_vencimiento=usuario.fecha_vencimiento,
        dias_restantes=detalle.dias_restantes,
        ultimo_escaneo=usuario.ultimo_escaneo,
    )
