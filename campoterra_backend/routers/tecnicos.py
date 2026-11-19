from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_dashboard_user
from database import get_db

router = APIRouter(tags=[])


@router.post("/api/tecnicos/", tags=["Catálogos del Sistema"])
def registrar_tecnico(
    tecnico: schemas.TecnicoCreate,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    """
    Registra a un nuevo técnico de mantenimiento.
    """
    nuevo_tecnico = models.Tecnico(
        nombre=tecnico.nombre,
        estado=tecnico.estado
    )

    db.add(nuevo_tecnico)
    db.commit()
    db.refresh(nuevo_tecnico)

    return {
        "mensaje": "¡Técnico registrado exitosamente!",
        "id_tecnico": nuevo_tecnico.id_tecnico
    }


@router.get("/api/tecnicos/", tags=["Catálogos del Sistema"])
def obtener_todos_los_tecnicos(user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    """
    Devuelve la lista completa de técnicos activos en la planta.
    """
    lista_tecnicos = db.query(models.Tecnico).all()
    return lista_tecnicos


@router.put("/api/tecnicos/{tecnico_id}", tags=["Control de Personal"])
def actualizar_tecnico(tecnico_id: int, tecnico_actualizado: schemas.TecnicoBase, user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    tecnico = db.query(models.Tecnico).filter(models.Tecnico.id_tecnico == tecnico_id).first()

    if tecnico:
        tecnico.nombre = tecnico_actualizado.nombre
        tecnico.estado = tecnico_actualizado.estado

        db.commit()
        db.refresh(tecnico)
        return tecnico

    return {"error": "Técnico no encontrado"}


@router.delete("/api/tecnicos/{tecnico_id}", tags=["Control de Personal"])
def eliminar_tecnico(tecnico_id: int, user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    # 1. Buscamos al técnico por su ID
    tecnico = db.query(models.Tecnico).filter(models.Tecnico.id_tecnico == tecnico_id).first()

    if not tecnico:
        return {"error": "Técnico no encontrado"}

    # 2. Si tiene bitácoras asociadas, no se puede borrar físicamente
    #    (id_tecnico es NOT NULL en la BD y se rompería el historial).
    #    En su lugar, se desactiva para preservar el historial intacto.
    tiene_bitacoras = db.query(models.Bitacora).filter(
        models.Bitacora.id_tecnico == tecnico_id
    ).first()

    if tiene_bitacoras:
        tecnico.estado = "Inactivo"
        db.commit()
        return {"mensaje": "Técnico desactivado (tiene historial de bitácoras, no se puede eliminar físicamente)"}

    # 3. Sin historial asociado, se puede borrar físicamente
    db.delete(tecnico)
    db.commit()
    return {"mensaje": "Técnico eliminado correctamente"}
