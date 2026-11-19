from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_dashboard_user
from database import get_db

router = APIRouter(tags=[])


@router.get(
    "/api/notificaciones",
    response_model=schemas.NotificacionesResponse,
    tags=["Dashboard Web"],
)
def obtener_notificaciones(
    solo_no_leidas: bool = False,
    limite: int = 50,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    limite = max(1, min(limite, 100))
    query = db.query(models.Notificacion)
    if solo_no_leidas:
        query = query.filter(models.Notificacion.leida.is_(False))
    notificaciones = (
        query.order_by(models.Notificacion.fecha.desc())
        .limit(limite)
        .all()
    )
    no_leidas = (
        db.query(models.Notificacion)
        .filter(models.Notificacion.leida.is_(False))
        .count()
    )
    return {
        "notificaciones": notificaciones,
        "no_leidas": no_leidas,
    }


@router.post("/api/notificaciones/leer-todas", tags=["Dashboard Web"])
def marcar_todas_notificaciones_leidas(
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    db.query(models.Notificacion).filter(
        models.Notificacion.leida.is_(False)
    ).update({models.Notificacion.leida: True}, synchronize_session=False)
    db.commit()
    return {"mensaje": "Notificaciones marcadas como leídas"}


@router.post("/api/notificaciones/{notificacion_id}/leer", tags=["Dashboard Web"])
def marcar_notificacion_leida(
    notificacion_id: int,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    notificacion = (
        db.query(models.Notificacion)
        .filter(models.Notificacion.id_notificacion == notificacion_id)
        .first()
    )
    if not notificacion:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    if not notificacion.leida:
        notificacion.leida = True
        db.commit()
    return {"mensaje": "Notificación marcada como leída"}


@router.get("/api/dashboard/stats", tags=["App Móvil Técnicos"])
def get_dashboard_stats(user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    # Todos los indicadores de actividad se calculan con la fecha de registro de
    # la bitácora, no con el estado actual del equipo.
    inicio_hoy = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_manana = inicio_hoy + timedelta(days=1)
    bitacoras_hoy = (
        db.query(models.Bitacora)
        .filter(
            models.Bitacora.fecha_registro >= inicio_hoy,
            models.Bitacora.fecha_registro < inicio_manana,
        )
        .all()
    )

    completados_hoy = len(bitacoras_hoy)
    correctivos_hoy = sum(
        1
        for bitacora in bitacoras_hoy
        if (bitacora.tipo_mantenimiento or "").strip().lower() == "correctivo"
    )
    preventivos_hoy = sum(
        1
        for bitacora in bitacoras_hoy
        if (bitacora.tipo_mantenimiento or "").strip().lower() == "preventivo"
    )
    porcentaje_preventivos = round(
        (preventivos_hoy / completados_hoy) * 100
    ) if completados_hoy else 0

    return {
        "completados_hoy": completados_hoy,
        "pendientes": 0, # Marcador fijo por ahora
        "fallas_abiertas": correctivos_hoy,
        "alertas_criticas": correctivos_hoy,
        "preventivos": porcentaje_preventivos,
    }


def obtener_periodo_semana(year: int, week: int):
    inicio_anio = date(year, 1, 1)
    inicio_semana_uno = inicio_anio - timedelta(days=(inicio_anio.weekday() + 1) % 7)
    inicio_semana = inicio_semana_uno + timedelta(days=(week - 1) * 7)
    inicio_siguiente_semana = inicio_semana + timedelta(days=7)
    max_semana = ((date(year + 1, 1, 1) - inicio_semana_uno).days + 6) // 7

    if week < 1 or week > max_semana:
        raise HTTPException(
            status_code=422,
            detail=f"La semana debe estar entre 1 y {max_semana} para el año {year}.",
        )

    return inicio_semana, inicio_siguiente_semana


@router.get("/api/dashboard/weekly", tags=["Dashboard Web"])
def get_weekly_dashboard(
    year: Optional[int] = None,
    week: Optional[int] = None,
    user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db),
):
    hoy = date.today()
    year = year or hoy.year
    if week is None:
        inicio_semana_actual = hoy - timedelta(days=(hoy.weekday() + 1) % 7)
        inicio_anio = date(year, 1, 1)
        inicio_semana_uno = inicio_anio - timedelta(days=(inicio_anio.weekday() + 1) % 7)
        week = ((inicio_semana_actual - inicio_semana_uno).days // 7) + 1

    inicio_semana, inicio_siguiente_semana = obtener_periodo_semana(year, week)
    bitacoras = (
        db.query(
            models.Bitacora.id_bitacora,
            models.Bitacora.fecha_registro,
            models.Bitacora.tipo_mantenimiento,
            models.Bitacora.descripcion,
            models.Bitacora.detalles_repuestos,
            models.AreaMantenimiento.nombre.label("nombre_area"),
            models.Equipo.nombre.label("nombre_equipo"),
            models.Tecnico.nombre.label("nombre_tecnico"),
        )
        .outerjoin(models.Equipo, models.Bitacora.id_equipo == models.Equipo.id_equipo)
        .outerjoin(models.AreaMantenimiento, models.Bitacora.id_area == models.AreaMantenimiento.id_area)
        .join(models.Tecnico, models.Bitacora.id_tecnico == models.Tecnico.id_tecnico)
        .filter(
            models.Bitacora.fecha_registro >= datetime.combine(inicio_semana, datetime.min.time()),
            models.Bitacora.fecha_registro < datetime.combine(inicio_siguiente_semana, datetime.min.time()),
        )
        .order_by(models.Bitacora.fecha_registro.desc())
        .all()
    )

    preventivos = sum(1 for bitacora in bitacoras if bitacora.tipo_mantenimiento == "Preventivo")
    correctivos = sum(1 for bitacora in bitacoras if bitacora.tipo_mantenimiento == "Correctivo")

    return {
        "year": year,
        "week": week,
        "inicio": inicio_semana.isoformat(),
        "fin": (inicio_siguiente_semana - timedelta(days=1)).isoformat(),
        "total": len(bitacoras),
        "preventivos": preventivos,
        "correctivos": correctivos,
        "bitacoras": [
            {
                "id_bitacora": bitacora.id_bitacora,
                "fecha_registro": bitacora.fecha_registro,
                "tipo_mantenimiento": bitacora.tipo_mantenimiento,
                "descripcion": bitacora.descripcion,
                "detalles_repuestos": bitacora.detalles_repuestos,
                "nombre_equipo": bitacora.nombre_equipo,
                "nombre_area": bitacora.nombre_area,
                "nombre_tecnico": bitacora.nombre_tecnico,
            }
            for bitacora in bitacoras
        ],
    }
