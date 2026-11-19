from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import create_access_token
from database import get_db

router = APIRouter(tags=[])


@router.post("/api/shift/start")
async def start_shift(data: schemas.ShiftStartRequest, db: Session = Depends(get_db)):
    tecnico_db = None
    if data.tecnico_id is not None:
        tecnico_db = (
            db.query(models.Tecnico)
            .filter(
                models.Tecnico.id_tecnico == data.tecnico_id,
                models.Tecnico.estado == "Activo",
            )
            .first()
        )
    elif data.tecnico:
        tecnico_db = (
            db.query(models.Tecnico)
            .filter(
                models.Tecnico.nombre == data.tecnico,
                models.Tecnico.estado == "Activo",
            )
            .first()
        )

    turno_db = None
    if data.turno_id is not None:
        turno_db = db.query(models.Turno).filter(models.Turno.id_turno == data.turno_id).first()
    elif data.turno:
        turno_db = db.query(models.Turno).filter(models.Turno.descripcion == data.turno).first()

    if not tecnico_db or not turno_db:
        raise HTTPException(
            status_code=401,
            detail="El técnico o turno seleccionado no es válido o ya no está activo.",
        )

    return {
        "status": "success",
        "message": "Jornada registrada correctamente",
        "tecnico_activo": tecnico_db.nombre,
        "tecnico_id": tecnico_db.id_tecnico,
        "turno_id": turno_db.id_turno,
        "access_token": create_access_token(str(tecnico_db.id_tecnico), "Tecnico"),
        "token_type": "bearer",
    }


@router.get("/api/shift/options", tags=["App Móvil Técnicos"])
def get_shift_options(db: Session = Depends(get_db)):
    """
    Obtiene los técnicos activos y los turnos (incluyendo sus horarios) desde MySQL.
    """
    tecnicos_db = db.query(models.Tecnico).filter(models.Tecnico.estado == "Activo").all()
    turnos_db = db.query(models.Turno).all()

    turnos_formateados = []
    for t in turnos_db:
        # Convertimos la hora a texto y tomamos solo los primeros 5 caracteres (HH:MM) para quitar los segundos
        inicio = str(t.hora_inicio)[:5]
        fin = str(t.hora_fin)[:5]

        # Formato final que verá el usuario en el Login y en su panel Home
        turnos_formateados.append({
            "id_turno": t.id_turno,
            "descripcion": t.descripcion,
            "etiqueta": f"{t.descripcion} ({inicio} a {fin})",
        })

    return {
        "tecnicos": [
            {"id_tecnico": t.id_tecnico, "nombre": t.nombre}
            for t in tecnicos_db
        ],
        "turnos": turnos_formateados
    }
