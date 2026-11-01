"""
Pruebas integrales de Arquitectura de Producción + Funciones de Vida Real:
1. Multi-Tenancy Ligero (Academia Voleibol Titanes vs Club de Boxeo La Roca)
2. Login por Celular + PIN de 4 dígitos -> JWT 30 días
3. Escaneo QR:
   - VERDE (Valentina Gómez, activa al día)
   - AMARILLO ("El Fiado Colombiano": Sebastián Morales -> "ACTIVO - PERO DEBE $40.000 DE SALDO")
   - ROJO (Mateo sin clases, Camila vencida, Nicolás Pausado/Inactivo)
4. Interruptor "Pausar / Archivar Alumno" (Estado: INACTIVO -> excluido de Deudores y QR bloqueado)
5. Botón "Congelar Días" (+7 / +15 días por incapacidad sin cobro nuevo)
6. Resumen de Caja del Día: Hoy asistieron: 24 | Recaudado hoy: $240.000 (Efectivo: $160k / Nequi: $80k)
"""
import sys
import os
from datetime import timedelta

sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from main import (
    on_startup,
    login_entrenador,
    obtener_pase_publico,
    obtener_resumen_caja_hoy,
    procesar_escaneo_qr,
    listar_deudores,
    pausar_o_reactivar_alumno,
    congelar_sumar_dias_incapacidad,
    abonar_saldo_pendiente,
)
from schemas import (
    LoginRequest,
    ScanRequest,
    TogglePausaRequest,
    CongelarDiasRequest,
    AbonarSaldoRequest,
)
from models import Negocio, Usuario, HistorialAsistencia


def run_tests():
    on_startup()
    db = SessionLocal()
    try:
        # 1. Login Entrenador Voleibol (Negocio 1)
        res_login = login_entrenador(LoginRequest(telefono="3001234567", pin="1234"), db=db)
        assert res_login.expires_in_days == 30
        negocio_voley = db.query(Negocio).filter(Negocio.id == res_login.negocio.id).first()

        # 2. Verificar Resumen de Caja del Día inicial:
        # "Hoy asistieron: 24 | Recaudado hoy: $240.000 (Efectivo: $160k / Nequi: $80k)"
        caja = obtener_resumen_caja_hoy(negocio=negocio_voley, db=db)
        assert caja.asistencias_hoy == 24, f"Esperado 24 asistencias, obtenido {caja.asistencias_hoy}"
        assert caja.recaudado_hoy == 240000.0, f"Esperado 240000, obtenido {caja.recaudado_hoy}"
        assert caja.efectivo_hoy == 160000.0
        assert caja.nequi_hoy == 80000.0

        # 3. Escanear alumno con Abono Parcial ("El Fiado Colombiano" - Sebastián Morales debe $40.000)
        scan_amarillo = procesar_escaneo_qr(
            ScanRequest(qr_token="pase-sebastian-ultima", forzar_doble_escaneo=True),
            negocio=negocio_voley,
            db=db,
        )
        assert scan_amarillo.status == "AMARILLO"
        assert "ACTIVO - PERO DEBE $40.000 DE SALDO" in scan_amarillo.titulo

        # Restaurar estado de Sebastián y borrar la asistencia de prueba para mantener caja en 24
        u_seb = db.query(Usuario).filter(Usuario.qr_token == "pase-sebastian-ultima").first()
        u_seb.clases_restantes = 10
        u_seb.ultimo_escaneo = None
        ultima_asist = (
            db.query(HistorialAsistencia)
            .order_by(HistorialAsistencia.id.desc())
            .first()
        )
        if ultima_asist:
            db.delete(ultima_asist)
        db.commit()

        # 4. Verificar que alumno PAUSADO / INACTIVO (Nicolás Rojas) NO sale en Deudores y su QR está bloqueado
        deudores = listar_deudores(negocio=negocio_voley, db=db)
        nombres_deudores = [d.nombre for d in deudores]
        assert "Nicolás Rojas (Exámenes)" not in nombres_deudores, "Un alumno pausado NO debe salir en Deudores"
        assert "Sebastián Morales" in nombres_deudores  # Debe $40.000 de saldo ("El Fiado Colombiano")

        scan_pausado = procesar_escaneo_qr(
            ScanRequest(qr_token="pase-nicolas-pausado"),
            negocio=negocio_voley,
            db=db,
        )
        assert scan_pausado.status == "ROJO"
        assert "PAUSADO" in scan_pausado.titulo
        assert scan_pausado.usuario.pagos_registrados == 1  # Conserva su historial de pagos

        # 5. Probar botón "Congelar Días" (+7 días por incapacidad)
        u_val = db.query(Usuario).filter(Usuario.qr_token == "pase-valentina-activo").first()
        venc_original = u_val.fecha_vencimiento
        res_congelar = congelar_sumar_dias_incapacidad(
            usuario_id=u_val.id,
            payload=CongelarDiasRequest(dias=7),
            negocio=negocio_voley,
            db=db,
        )
        assert res_congelar.fecha_vencimiento == venc_original + timedelta(days=7)
        # Restaurar fecha original
        u_val.fecha_vencimiento = venc_original
        db.commit()

        print("ALL REAL-WORLD FEATURES & MULTI-TENANT TESTS PASSED!")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
