from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from auth import create_access_token, hash_password, require_dashboard_user, verify_password
from database import get_db

router = APIRouter(tags=[])


@router.post("/api/usuarios/", tags=["Seguridad y Accesos"])
def registrar_usuario(usuario: schemas.UsuarioCreate, user: dict = Depends(require_dashboard_user), db: Session = Depends(get_db)):
    if usuario.rol != "Administrador":
        raise HTTPException(status_code=422, detail="Esta ruta solo crea cuentas de encargado")
    if db.query(models.Usuario).filter(models.Usuario.username == usuario.username).first():
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    nuevo_usuario = models.Usuario(
        username=usuario.username,
        password=hash_password(usuario.password),
        rol=usuario.rol,
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return {"mensaje": "¡Usuario creado con éxito!", "id_usuario": nuevo_usuario.id_usuario, "username": nuevo_usuario.username}


@router.post("/api/login/", tags=["Seguridad y Accesos"])
def iniciar_sesion(credenciales: schemas.UsuarioLogin, db: Session = Depends(get_db)):
    usuario_db = db.query(models.Usuario).filter(models.Usuario.username == credenciales.username).first()
    if not usuario_db or not verify_password(credenciales.password, usuario_db.password):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if not usuario_db.activo:
        raise HTTPException(status_code=403, detail="Esta cuenta ha sido dada de baja")
    if usuario_db.rol != "Administrador":
        raise HTTPException(status_code=403, detail="Acceso exclusivo del encargado")
    if usuario_db.password and not usuario_db.password.startswith("pbkdf2_sha256$"):
        usuario_db.password = hash_password(credenciales.password)
        db.commit()
    return {
        "mensaje": f"¡Bienvenido al CMMS, {usuario_db.rol}!",
        "username": usuario_db.username,
        "rol": usuario_db.rol,
        "access_token": create_access_token(usuario_db.username, usuario_db.rol),
        "token_type": "bearer",
    }


def _perfil_usuario(usuario_db: models.Usuario) -> dict:
    return {
        "username": usuario_db.username,
        "rol": usuario_db.rol,
        "nombre": usuario_db.nombre or (
            "Jorge Ríos" if usuario_db.username.lower() == "jrios" else usuario_db.username
        ),
        "cargo": usuario_db.cargo or (
            "Jefe de Mantenimiento"
            if usuario_db.username.lower() == "jrios"
            else usuario_db.rol
        ),
    }


@router.get(
    "/api/mi-perfil",
    response_model=schemas.PerfilUsuarioResponse,
    tags=["Seguridad y Accesos"],
)
def obtener_mi_perfil(
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    usuario_db = db.query(models.Usuario).filter(
        models.Usuario.username == user["sub"],
        models.Usuario.activo.is_(True),
    ).first()
    if not usuario_db:
        raise HTTPException(status_code=404, detail="Usuario de dashboard no encontrado")
    return _perfil_usuario(usuario_db)


@router.put(
    "/api/mi-perfil",
    response_model=schemas.PerfilUsuarioResponse,
    tags=["Seguridad y Accesos"],
)
def actualizar_mi_perfil(
    datos: schemas.PerfilUsuarioUpdate,
    user: dict = Depends(require_dashboard_user),
    db: Session = Depends(get_db),
):
    usuario_db = db.query(models.Usuario).filter(
        models.Usuario.username == user["sub"],
        models.Usuario.activo.is_(True),
    ).first()
    if not usuario_db:
        raise HTTPException(status_code=404, detail="Usuario de dashboard no encontrado")

    if datos.nueva_contrasena and not datos.contrasena_actual:
        raise HTTPException(
            status_code=400,
            detail="La contraseña actual es obligatoria para cambiarla",
        )
    if datos.nueva_contrasena and not verify_password(
        datos.contrasena_actual, usuario_db.password
    ):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")

    usuario_db.nombre = datos.nombre.strip()
    usuario_db.cargo = datos.cargo.strip()
    if len(usuario_db.nombre) < 2 or len(usuario_db.cargo) < 2:
        raise HTTPException(status_code=422, detail="Nombre y cargo no pueden quedar vacíos")
    if datos.nueva_contrasena:
        usuario_db.password = hash_password(datos.nueva_contrasena)

    db.commit()
    db.refresh(usuario_db)
    return _perfil_usuario(usuario_db)
