from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_dashboard_user, require_active_user
from database import get_db

router = APIRouter(tags=[])


@router.get("/equipos/", response_model=list[schemas.Equipo])
def obtener_equipos(user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    # Le pedimos a SQLAlchemy que traiga todos los registros de la tabla Equipos
    equipos = db.query(models.Equipo).all()
    return equipos


@router.post("/api/equipos/", tags=["Catálogos del Sistema"])
def registrar_equipo(equipo: schemas.EquipoRegistroCreate, user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    """
    Da de alta una nueva máquina o equipo en la planta.
    """
    nuevo_equipo = models.Equipo(
        codigo_interno=equipo.codigo_interno,
        nombre=equipo.nombre,
        area_ubicacion=equipo.area_ubicacion,
        estado=equipo.estado,
        notas_adicionales=equipo.notas_adicionales
    )

    db.add(nuevo_equipo)
    db.commit()
    db.refresh(nuevo_equipo)

    return {
        "mensaje": "¡Equipo registrado exitosamente!",
        "id_equipo": nuevo_equipo.id_equipo
    }


@router.get("/api/equipos/", tags=["Catálogos del Sistema"])
def obtener_todos_los_equipos(user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    """
    Devuelve la lista completa de equipos registrados.
    Ideal para llenar menús desplegables (dropdowns) en la app.
    """
    lista_equipos = db.query(models.Equipo).all()
    return lista_equipos


@router.delete("/api/equipos/{equipo_id}", tags=["Catálogo de Maquinaria"])
def eliminar_equipo(equipo_id: int, user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    # Buscamos el equipo por su ID
    equipo = db.query(models.Equipo).filter(models.Equipo.id_equipo == equipo_id).first()

    if equipo:
        db.delete(equipo)
        db.commit()
        return {"mensaje": "Equipo eliminado correctamente"}
    return {"error": "Equipo no encontrado"}


@router.put("/api/equipos/{equipo_id}", tags=["Catálogo de Maquinaria"])
def actualizar_equipo(equipo_id: int, equipo_actualizado: schemas.EquipoCreate, user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    equipo = db.query(models.Equipo).filter(models.Equipo.id_equipo == equipo_id).first()

    if equipo:
        equipo.codigo_interno = equipo_actualizado.codigo_interno
        equipo.nombre = equipo_actualizado.nombre
        equipo.area_ubicacion = equipo_actualizado.area_ubicacion
        equipo.estado = equipo_actualizado.estado # <--- AÑADIMOS ESTA LÍNEA

        db.commit()
        db.refresh(equipo)
        return equipo

    return {"error": "Equipo no encontrado"}
