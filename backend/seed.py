from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from models import Negocio, Plan, Usuario, HistorialPago, HistorialAsistencia


def seed_initial_data(db: Session):
    """
    Siembra (o actualiza en caliente si ya existía la BD) los datos de prueba reales:
    - Multi-Tenancy: Academia Voleibol Titanes (PIN 1234) y Club de Boxeo La Roca (PIN 9999)
    - Alumno Activo al día (VERDE): Valentina Gómez
    - Alumno con 'El Fiado Colombiano' (AMARILLO - Debe $40.000 de saldo): Sebastián Morales
    - Alumnos Deudores (ROJO): Mateo Rodríguez (0 clases) y Camila Herrera (vencida)
    - Alumno Pausado / Archivado por exámenes (INACTIVO, fuera de Deudores): Nicolás Rojas
    - Resumen de Caja del Día real en BD: 24 asistencias hoy y $240.000 recaudados ($160k Efectivo / $80k Nequi)
    """
    hoy = date.today()
    ahora = datetime.utcnow()

    voley = db.query(Negocio).filter(Negocio.telefono_admin == "3001234567").first()
    if not voley:
        voley = Negocio(
            nombre_gimnasio="Academia Voleibol Titanes",
            telefono_admin="3001234567",
            pin_acceso_admin="1234",
            mensaje_whatsapp_personalizado=(
                "Hola {nombre} 🏐, te escribe el profe de *{gimnasio}*. "
                "Te recordamos ponerte al día con tu plan ({plan}). "
                "Mira tu carnet digital aquí: {link_pase}"
            ),
        )
        db.add(voley)
        db.flush()

        plan_voley_12 = Plan(
            negocio_id=voley.id,
            nombre="Tiquetera 12 Clases",
            clases_totales=12,
            duracion_dias=30,
            precio=80000,
        )
        plan_voley_mes = Plan(
            negocio_id=voley.id,
            nombre="Mensualidad Ilimitada",
            clases_totales=None,
            duracion_dias=30,
            precio=120000,
        )
        plan_voley_4 = Plan(
            negocio_id=voley.id,
            nombre="Tiquetera 4 Clases (Sábados)",
            clases_totales=4,
            duracion_dias=30,
            precio=40000,
        )
        db.add_all([plan_voley_12, plan_voley_mes, plan_voley_4])
        db.flush()
    else:
        plan_voley_12 = db.query(Plan).filter(Plan.negocio_id == voley.id).order_by(Plan.id.asc()).first()
        plan_voley_mes = (
            db.query(Plan)
            .filter(Plan.negocio_id == voley.id, Plan.clases_totales == None)
            .first()
            or plan_voley_12
        )

    # Asegurar usuarios de prueba de Voleibol
    u_valentina = db.query(Usuario).filter(Usuario.qr_token == "pase-valentina-activo").first()
    if not u_valentina:
        u_valentina = Usuario(
            negocio_id=voley.id,
            plan_id=plan_voley_12.id,
            nombre="Valentina Gómez",
            telefono="573001112233",
            qr_token="pase-valentina-activo",
            clases_restantes=8,
            fecha_vencimiento=hoy + timedelta(days=22),
            pausado=False,
            saldo_pendiente=0.0,
        )
        db.add(u_valentina)

    u_sebastian = db.query(Usuario).filter(Usuario.qr_token == "pase-sebastian-ultima").first()
    if not u_sebastian:
        u_sebastian = Usuario(
            negocio_id=voley.id,
            plan_id=plan_voley_12.id,
            nombre="Sebastián Morales",
            telefono="573004445566",
            qr_token="pase-sebastian-ultima",
            clases_restantes=10,
            fecha_vencimiento=hoy + timedelta(days=25),
            pausado=False,
            saldo_pendiente=40000.0,
        )
        db.add(u_sebastian)
    else:
        if u_sebastian.saldo_pendiente == 0:
            u_sebastian.saldo_pendiente = 40000.0
            u_sebastian.clases_restantes = max(u_sebastian.clases_restantes or 0, 10)

    u_mateo = db.query(Usuario).filter(Usuario.qr_token == "pase-mateo-sin-clases").first()
    if not u_mateo:
        u_mateo = Usuario(
            negocio_id=voley.id,
            plan_id=plan_voley_12.id,
            nombre="Mateo Rodríguez",
            telefono="573017778899",
            qr_token="pase-mateo-sin-clases",
            clases_restantes=0,
            fecha_vencimiento=hoy + timedelta(days=10),
            pausado=False,
            saldo_pendiente=0.0,
        )
        db.add(u_mateo)

    u_camila = db.query(Usuario).filter(Usuario.qr_token == "pase-camila-vencida").first()
    if not u_camila:
        u_camila = Usuario(
            negocio_id=voley.id,
            plan_id=plan_voley_mes.id,
            nombre="Camila Herrera",
            telefono="573152223344",
            qr_token="pase-camila-vencida",
            clases_restantes=None,
            fecha_vencimiento=hoy - timedelta(days=4),
            pausado=False,
            saldo_pendiente=0.0,
        )
        db.add(u_camila)

    u_nicolas = db.query(Usuario).filter(Usuario.qr_token == "pase-nicolas-pausado").first()
    if not u_nicolas:
        u_nicolas = Usuario(
            negocio_id=voley.id,
            plan_id=plan_voley_12.id,
            nombre="Nicolás Rojas (Exámenes)",
            telefono="573189990011",
            qr_token="pase-nicolas-pausado",
            clases_restantes=0,
            fecha_vencimiento=hoy - timedelta(days=12),
            pausado=True,
            saldo_pendiente=0.0,
        )
        db.add(u_nicolas)
        db.flush()

        # Pago histórico de Nicolás para demostrar que al pausarlo NO pierde su historial
        db.add(
            HistorialPago(
                negocio_id=voley.id,
                usuario_id=u_nicolas.id,
                plan_id=plan_voley_12.id,
                monto=80000.0,
                metodo_pago="NEQUI",
                tipo_pago="INSCRIPCION",
                fecha_hora=ahora - timedelta(days=45),
            )
        )

    db.flush()

    # Asegurar que existan los pagos y asistencias de prueba del día de hoy:
    # Hoy asistieron: 24 | Recaudado hoy: $240.000 (Efectivo: $160k / Nequi: $80k)
    # Solo inicializar la caja demo si aún no hay pagos Nequi ni Efectivo del seed
    inicio_dia = datetime(hoy.year, hoy.month, hoy.day, 0, 0, 0)
    pagos_hoy_count = (
        db.query(HistorialPago)
        .filter(
            HistorialPago.negocio_id == voley.id,
            HistorialPago.fecha_hora >= inicio_dia,
        )
        .count()
    )
    if pagos_hoy_count == 0:
        db.add_all(
            [
                HistorialPago(
                    negocio_id=voley.id,
                    usuario_id=u_valentina.id,
                    plan_id=plan_voley_12.id,
                    monto=80000.0,
                    metodo_pago="NEQUI",
                    tipo_pago="RENOVACION",
                    fecha_hora=ahora - timedelta(hours=3),
                ),
                HistorialPago(
                    negocio_id=voley.id,
                    usuario_id=u_camila.id,
                    plan_id=plan_voley_mes.id,
                    monto=120000.0,
                    metodo_pago="EFECTIVO",
                    tipo_pago="RENOVACION",
                    fecha_hora=ahora - timedelta(hours=2),
                ),
                HistorialPago(
                    negocio_id=voley.id,
                    usuario_id=u_sebastian.id,
                    plan_id=plan_voley_12.id,
                    monto=40000.0,
                    metodo_pago="EFECTIVO",
                    tipo_pago="ABONO_SALDO",
                    fecha_hora=ahora - timedelta(hours=1),
                ),
            ]
        )

    asistencias_hoy_count = (
        db.query(HistorialAsistencia)
        .filter(
            HistorialAsistencia.negocio_id == voley.id,
            HistorialAsistencia.fecha_hora >= inicio_dia,
            HistorialAsistencia.estado_resultado.in_(["VERDE", "AMARILLO"]),
        )
        .count()
    )
    if asistencias_hoy_count < 24:
        faltantes = 24 - asistencias_hoy_count
        for i in range(faltantes):
            db.add(
                HistorialAsistencia(
                    negocio_id=voley.id,
                    usuario_id=u_valentina.id if i % 2 == 0 else u_sebastian.id,
                    fecha_hora=ahora - timedelta(minutes=180 - i * 5),
                    estado_resultado="VERDE" if i % 2 == 0 else "AMARILLO",
                    detalle="Asistencia registrada en cancha",
                )
            )

    # ==========================================================
    # NEGOCIO 2: Club de Boxeo La Roca (Aislamiento Multi-Tenant)
    # ==========================================================
    boxeo = db.query(Negocio).filter(Negocio.telefono_admin == "3109876543").first()
    if not boxeo:
        boxeo = Negocio(
            nombre_gimnasio="Club de Boxeo La Roca",
            telefono_admin="3109876543",
            pin_acceso_admin="9999",
            mensaje_whatsapp_personalizado=(
                "¡Qué tal {nombre}! 🥊 En *{gimnasio}* tu plan ({plan}) tiene un pendiente o ha finalizado. "
                "Pasa por recepción para renovar: {link_pase}"
            ),
        )
        db.add(boxeo)
        db.flush()

        plan_box_10 = Plan(
            negocio_id=boxeo.id,
            nombre="Tiquetera 10 Rounds (10 Clases)",
            clases_totales=10,
            duracion_dias=30,
            precio=85000,
        )
        plan_box_mes = Plan(
            negocio_id=boxeo.id,
            nombre="Mensualidad Boxeo Libre",
            clases_totales=None,
            duracion_dias=30,
            precio=110000,
        )
        db.add_all([plan_box_10, plan_box_mes])
        db.flush()

        usuarios_boxeo = [
            Usuario(
                negocio_id=boxeo.id,
                plan_id=plan_box_10.id,
                nombre="Andrés 'El Toro' Castro",
                telefono="573105556677",
                qr_token="pase-boxeo-andres",
                clases_restantes=6,
                fecha_vencimiento=hoy + timedelta(days=18),
                pausado=False,
                saldo_pendiente=0.0,
            ),
            Usuario(
                negocio_id=boxeo.id,
                plan_id=plan_box_mes.id,
                nombre="Laura Méndez",
                telefono="573128889900",
                qr_token="pase-boxeo-laura-vencida",
                clases_restantes=None,
                fecha_vencimiento=hoy - timedelta(days=6),
                pausado=False,
                saldo_pendiente=0.0,
            ),
        ]
        db.add_all(usuarios_boxeo)

    db.commit()
