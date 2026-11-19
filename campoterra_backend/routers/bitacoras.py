from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_dashboard_user, require_mobile_user
from database import get_db

router = APIRouter(tags=[])


@router.post("/api/bitacoras/", tags=["App Móvil Técnicos"])
def crear_bitacora(
    bitacora: schemas.BitacoraCreate,
    user: dict = Depends(require_mobile_user),
    db: Session = Depends(get_db),
):
    """
    Recibe la información de la tablet y la inserta en MySQL.
    """
    if user["sub"] != str(bitacora.id_tecnico):
        raise HTTPException(
            status_code=403,
            detail="El técnico del reporte no coincide con la sesión móvil activa.",
        )
    # Enlazamos los datos recibidos con el modelo de SQLAlchemy
    nueva_bitacora = models.Bitacora(
        id_equipo=bitacora.id_equipo,
        id_area=bitacora.id_area,
        id_tecnico=bitacora.id_tecnico,
        id_turno=bitacora.id_turno,
        tipo_mantenimiento=bitacora.tipo_mantenimiento,
        descripcion=bitacora.descripcion,
        detalles_repuestos=bitacora.detalles_repuestos,
        fecha_registro=datetime.now(),
    )

    # Guardamos en la base de datos
    db.add(nueva_bitacora)
    db.commit()
    db.refresh(nueva_bitacora) # Obtenemos el folio autoincrementable generado
    equipo = db.query(models.Equipo).filter(models.Equipo.id_equipo == bitacora.id_equipo).first()
    tecnico = db.query(models.Tecnico).filter(models.Tecnico.id_tecnico == bitacora.id_tecnico).first()
    db.add(models.Notificacion(
        tipo="nuevo_reporte",
        titulo="Nuevo reporte registrado",
        mensaje=(
            f"Equipo: {equipo.nombre if equipo else bitacora.id_equipo}. "
            f"Técnico: {tecnico.nombre if tecnico else bitacora.id_tecnico}."
        ),
        fecha=nueva_bitacora.fecha_registro or datetime.now(),
        enlace="bitacoras.html",
        referencia_id=nueva_bitacora.id_bitacora,
    ))
    db.commit()

    return {
        "mensaje": "¡Bitácora registrada con éxito!",
        "folio_bitacora": nueva_bitacora.id_bitacora
    }


@router.get("/api/bitacoras/", response_model=list[schemas.BitacoraResponse], tags=["Historial de Bitácoras"])
def obtener_bitacoras(user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    # 1. Hacemos la consulta con los JOIN
    resultados = db.query(
        models.Bitacora.id_bitacora,
        models.Bitacora.fecha_registro,
        models.Bitacora.tipo_mantenimiento,
        models.Bitacora.descripcion,
        models.Bitacora.detalles_repuestos,
        models.AreaMantenimiento.nombre.label("nombre_area"),
        models.Equipo.nombre.label("nombre_equipo"),
        models.AreaMantenimiento.nombre.label("nombre_area"),
        models.Tecnico.nombre.label("nombre_tecnico")
    ).outerjoin(models.Equipo, models.Bitacora.id_equipo == models.Equipo.id_equipo)\
     .outerjoin(models.AreaMantenimiento, models.Bitacora.id_area == models.AreaMantenimiento.id_area)\
     .join(models.Tecnico, models.Bitacora.id_tecnico == models.Tecnico.id_tecnico).all()

    # 2. Convertimos estrictamente cada fila (Row) en un diccionario
    bitacoras_formateadas = []
    for r in resultados:
        bitacoras_formateadas.append({
            "id_bitacora": r.id_bitacora,
            "fecha_registro": r.fecha_registro,
            "nombre_equipo": r.nombre_equipo,
            "nombre_area": r.nombre_area,
            "nombre_tecnico": r.nombre_tecnico,
            "tipo_mantenimiento": r.tipo_mantenimiento,
            "descripcion": r.descripcion,
            "detalles_repuestos": r.detalles_repuestos
        })

    return bitacoras_formateadas
