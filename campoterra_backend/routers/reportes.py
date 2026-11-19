from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_mobile_user
from database import get_db

router = APIRouter(tags=[])


@router.post("/api/reports/new", tags=["App Móvil Técnicos"])
def create_new_report(
    report: schemas.NuevoReporteRequest,
    user: dict = Depends(require_mobile_user),
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    if user["sub"] != str(report.tecnico_id):
        raise HTTPException(
            status_code=403,
            detail="El técnico del reporte no coincide con la sesión móvil activa.",
        )
    area = db.query(models.AreaMantenimiento).filter(
        models.AreaMantenimiento.id_area == report.area_id,
        models.AreaMantenimiento.activa.is_(True),
    ).first()
    if not area:
        raise HTTPException(status_code=422, detail="El área de mantenimiento seleccionada no es válida.")
    equipo = None
    if report.equipo_id is not None:
        equipo = db.query(models.Equipo).filter(
            models.Equipo.id_equipo == report.equipo_id
        ).first()
        if not equipo:
            raise HTTPException(status_code=404, detail="La maquinaria seleccionada no existe.")
    reservation = None
    if idempotency_key:
        reservation = (
            db.query(models.ReporteIdempotencia)
            .filter(models.ReporteIdempotencia.idempotency_key == idempotency_key)
            .first()
        )
        if reservation:
            if reservation.tecnico_id != report.tecnico_id:
                raise HTTPException(status_code=409, detail="La clave de idempotencia no pertenece a este técnico.")
            return {
                "status": "success",
                "message": reservation.response_message,
                "folio_bitacora": reservation.response_folio,
                "idempotent_replay": True,
            }
    area = db.query(models.AreaMantenimiento).filter(
        models.AreaMantenimiento.id_area == report.area_id,
        models.AreaMantenimiento.activa.is_(True),
    ).first()
    if not area:
        raise HTTPException(
            status_code=422,
            detail="El área de mantenimiento seleccionada no es válida.",
        )
    equipo = None
    if report.equipo_id is not None:
        equipo = db.query(models.Equipo).filter(
            models.Equipo.id_equipo == report.equipo_id
        ).first()
        if not equipo:
            raise HTTPException(status_code=404, detail="La maquinaria seleccionada no existe.")
    if idempotency_key:
        try:
            with db.begin_nested():
                reservation = models.ReporteIdempotencia(
                    idempotency_key=idempotency_key,
                    tecnico_id=report.tecnico_id,
                    response_message="¡Reporte guardado con éxito!",
                    response_folio=0,
                )
                db.add(reservation)
                db.flush()
        except IntegrityError:
            reservation = (
                db.query(models.ReporteIdempotencia)
                .filter(models.ReporteIdempotencia.idempotency_key == idempotency_key)
                .first()
            )
            if reservation:
                return {
                    "status": "success",
                    "message": reservation.response_message,
                    "folio_bitacora": reservation.response_folio,
                    "idempotent_replay": True,
                }
            raise HTTPException(status_code=409, detail="No se pudo reservar la clave de idempotencia.")
    cantidades_por_pieza = {}
    for pieza in report.piezas:
        if pieza.qty <= 0:
            raise HTTPException(
                status_code=422,
                detail=f"La cantidad de la pieza {pieza.partId} debe ser mayor que cero.",
            )
        cantidades_por_pieza[pieza.partId] = (
            cantidades_por_pieza.get(pieza.partId, 0) + pieza.qty
        )

    piezas_db = {}
    for part_id, cantidad in cantidades_por_pieza.items():
        pieza_db = (
            db.query(models.Pieza)
            .filter(models.Pieza.id_pieza == part_id)
            .with_for_update()
            .first()
        )
        if not pieza_db:
            raise HTTPException(
                status_code=404,
                detail=f"La pieza {part_id} no existe en el inventario.",
            )
        if pieza_db.stock < cantidad:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Stock insuficiente para {pieza_db.nombre}. "
                    f"Disponible: {pieza_db.stock}; solicitado: {cantidad}."
                ),
            )
        piezas_db[part_id] = pieza_db

    detalles_texto = None
    if piezas_db:
        detalles_texto = ", ".join(
            f"{pieza.nombre} (Cant: {cantidades_por_pieza[part_id]})"
            for part_id, pieza in piezas_db.items()
        )
        for part_id, pieza in piezas_db.items():
            pieza.stock -= cantidades_por_pieza[part_id]

    nueva_bitacora = models.Bitacora(
        id_equipo=report.equipo_id,
        id_area=report.area_id,
        id_tecnico=report.tecnico_id,
        id_turno=report.turno_id,
        tipo_mantenimiento=report.tipo_trabajo,
        descripcion=report.descripcion,
        detalles_repuestos=detalles_texto,
        fecha_registro=datetime.now(),
    )

    db.add(nueva_bitacora)
    db.flush()
    if reservation:
        reservation.response_folio = nueva_bitacora.id_bitacora
    for part_id in piezas_db:
        db.add(models.MovimientoPieza(
            id_pieza=part_id,
            tipo="Salida",
            cantidad=cantidades_por_pieza[part_id],
            motivo=f"Reporte de mantenimiento #{nueva_bitacora.id_bitacora}",
            fecha_movimiento=datetime.now(),
        ))
    tecnico = db.query(models.Tecnico).filter(models.Tecnico.id_tecnico == report.tecnico_id).first()
    db.add(models.Notificacion(
        tipo="nuevo_reporte",
        titulo="Nuevo reporte registrado",
        mensaje=(
            f"Área: {area.nombre}. "
            f"Maquinaria: {equipo.nombre if equipo else 'No especificada'}. "
            f"Técnico: {tecnico.nombre if tecnico else report.tecnico_id}."
        ),
        fecha=nueva_bitacora.fecha_registro or datetime.now(),
        enlace="bitacoras.html",
        referencia_id=nueva_bitacora.id_bitacora,
    ))
    db.commit()
    db.refresh(nueva_bitacora)

    return {
        "status": "success",
        "message": "¡Reporte guardado con éxito!",
        "folio_bitacora": nueva_bitacora.id_bitacora,
        "idempotent_replay": False,
    }


@router.post("/api/reports/urgent")
async def create_urgent_alert(
    alerta: schemas.AlertaUrgenteRequest,
    user: dict = Depends(require_mobile_user),
    db: Session = Depends(get_db),
):
    print("\n" + "🚨"*20)
    print("🚨 ALERTA DE FALLA URGENTE 🚨")
    print("🚨"*20)
    print(f"🛑 Línea Detenida: {'SÍ' if alerta.linea_detenida else 'NO'}")
    print(f"⚠️  Prioridad: {alerta.prioridad.upper()}")
    print(f"⚙️  Equipo: {alerta.equipo}")
    print(f"📝 Descripción: {alerta.descripcion}")
    print("🚨"*20 + "\n")
    db.add(models.Notificacion(
        tipo="alerta_urgente",
        titulo="Alerta urgente de mantenimiento",
        mensaje=f"Equipo: {alerta.equipo}. {alerta.descripcion}",
        fecha=datetime.now(),
        enlace="dashboard.html",
    ))
    db.commit()

    return {
        "status": "success",
        "message": f"Alerta enviada a mantenimiento con prioridad {alerta.prioridad}"
    }
