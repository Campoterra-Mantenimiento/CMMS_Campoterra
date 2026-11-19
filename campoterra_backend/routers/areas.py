from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_dashboard_user, require_mobile_user
from database import get_db

router = APIRouter(tags=[])


@router.get("/api/areas-mantenimiento", tags=["Catálogos del Sistema"])
def obtener_areas_mantenimiento(
    user: dict = Depends(require_mobile_user),
    db: Session = Depends(get_db),
):
    """Catálogo estable para capturas móviles y reportes Offline First."""
    return [
        {"id_area": area.id_area, "nombre": area.nombre}
        for area in db.query(models.AreaMantenimiento)
        .filter(models.AreaMantenimiento.activa.is_(True))
        .order_by(models.AreaMantenimiento.id_area)
        .all()
    ]


def _normalizar_nombre_area(nombre: str) -> str:
    return " ".join(nombre.strip().split())


def _buscar_area_duplicada(
    db: Session, nombre: str, excluir_id: Optional[int] = None
):
    query = db.query(models.AreaMantenimiento).filter(
        func.lower(func.trim(models.AreaMantenimiento.nombre)) == nombre.lower()
    )
    if excluir_id is not None:
        query = query.filter(models.AreaMantenimiento.id_area != excluir_id)
    return query.first()


@router.get(
    "/api/areas",
    response_model=list[schemas.AreaResponse],
    tags=["Catálogo de Áreas"],
)
def obtener_areas(
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.AreaMantenimiento)
        .order_by(models.AreaMantenimiento.id_area)
        .all()
    )


@router.post(
    "/api/areas",
    response_model=schemas.AreaResponse,
    status_code=201,
    tags=["Catálogo de Áreas"],
)
def crear_area(
    datos: schemas.AreaCreate,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    nombre = _normalizar_nombre_area(datos.nombre)
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre del área es obligatorio.")
    if _buscar_area_duplicada(db, nombre):
        raise HTTPException(status_code=409, detail="Ya existe un área con ese nombre.")
    area = models.AreaMantenimiento(nombre=nombre, activa=datos.activa)
    db.add(area)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un área con ese nombre.")
    db.refresh(area)
    return area


@router.put(
    "/api/areas/{area_id}",
    response_model=schemas.AreaResponse,
    tags=["Catálogo de Áreas"],
)
def actualizar_area(
    area_id: int,
    datos: schemas.AreaUpdate,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    area = db.query(models.AreaMantenimiento).filter(
        models.AreaMantenimiento.id_area == area_id
    ).first()
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada.")
    nombre = _normalizar_nombre_area(datos.nombre)
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre del área es obligatorio.")
    if _buscar_area_duplicada(db, nombre, excluir_id=area_id):
        raise HTTPException(status_code=409, detail="Ya existe un área con ese nombre.")
    area.nombre = nombre
    db.commit()
    db.refresh(area)
    return area


@router.delete("/api/areas/{area_id}", tags=["Catálogo de Áreas"])
def eliminar_area(
    area_id: int,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    area = db.query(models.AreaMantenimiento).filter(
        models.AreaMantenimiento.id_area == area_id
    ).first()
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada.")
    if db.query(models.Bitacora).filter(models.Bitacora.id_area == area_id).first():
        raise HTTPException(
            status_code=409,
            detail="El área tiene historial de reportes y no puede borrarse físicamente. Desactívala.",
        )
    db.delete(area)
    db.commit()
    return {"mensaje": "Área eliminada porque no tiene historial de reportes."}


@router.patch(
    "/api/areas/{area_id}/status",
    response_model=schemas.AreaResponse,
    tags=["Catálogo de Áreas"],
)
def cambiar_estado_area(
    area_id: int,
    activa: bool,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    area = db.query(models.AreaMantenimiento).filter(
        models.AreaMantenimiento.id_area == area_id
    ).first()
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada.")
    area.activa = activa
    db.commit()
    db.refresh(area)
    return area
