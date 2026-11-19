from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_dashboard_user, require_active_user
from database import get_db

router = APIRouter(tags=[])


@router.get("/api/piezas/", response_model=list[schemas.PiezaResponse], tags=["Catálogos del Sistema"])
def obtener_piezas(user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    """Devuelve el inventario completo para la App y el Dashboard"""
    return db.query(models.Pieza).all()


@router.post("/api/piezas/", response_model=schemas.PiezaResponse, tags=["Catálogos del Sistema"])
def registrar_pieza(pieza: schemas.PiezaCreate, user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    """Permite al Dashboard Web agregar nuevas piezas"""
    nueva_pieza = models.Pieza(**pieza.dict())
    db.add(nueva_pieza)
    db.commit()
    db.refresh(nueva_pieza)
    return nueva_pieza


@router.post("/api/piezas/{pieza_id}/entradas", response_model=schemas.PiezaResponse, tags=["Inventario"])
def registrar_entrada_pieza(
    pieza_id: int,
    entrada: schemas.EntradaPiezaRequest,
    user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db),
):
    if entrada.cantidad <= 0:
        raise HTTPException(status_code=422, detail="La cantidad debe ser mayor que cero.")

    pieza = (
        db.query(models.Pieza)
        .filter(models.Pieza.id_pieza == pieza_id)
        .with_for_update()
        .first()
    )
    if not pieza:
        raise HTTPException(status_code=404, detail="La pieza no existe en el inventario.")

    pieza.stock += entrada.cantidad
    db.add(models.MovimientoPieza(
        id_pieza=pieza_id,
        tipo="Entrada",
        cantidad=entrada.cantidad,
        motivo=entrada.motivo,
        fecha_movimiento=datetime.now(),
    ))
    db.commit()
    db.refresh(pieza)
    return pieza


@router.get("/api/inventario/movimientos", response_model=list[schemas.MovimientoPiezaResponse], tags=["Inventario"])
def obtener_movimientos_inventario(user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    movimientos = (
        db.query(
            models.MovimientoPieza.id_movimiento,
            models.MovimientoPieza.id_pieza,
            models.Pieza.nombre.label("nombre_pieza"),
            models.MovimientoPieza.tipo,
            models.MovimientoPieza.cantidad,
            models.MovimientoPieza.motivo,
            models.MovimientoPieza.fecha_movimiento,
        )
        .join(models.Pieza, models.MovimientoPieza.id_pieza == models.Pieza.id_pieza)
        .order_by(models.MovimientoPieza.fecha_movimiento.desc())
        .limit(200)
        .all()
    )
    return movimientos
