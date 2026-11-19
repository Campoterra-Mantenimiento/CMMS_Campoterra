"""Provision the first administrator locally; never exposed as an HTTP route."""
from getpass import getpass


def main():
    from auth import hash_password
    from database import SessionLocal
    from models import Usuario

    with SessionLocal() as db:
        if db.query(Usuario).filter(Usuario.rol == "Administrador", Usuario.activo.is_(True)).first():
            raise SystemExit("Ya existe un encargado activo. Usa su sesión para crear otras cuentas.")
        username = input("Usuario del encargado: ").strip()
        if not username or len(username) > 50:
            raise SystemExit("El usuario debe tener entre 1 y 50 caracteres.")
        if db.query(Usuario).filter(Usuario.username == username).first():
            raise SystemExit("Ese usuario ya existe; no se modificó su cuenta.")
        password = getpass("Contraseña (mínimo 12 caracteres): ")
        if len(password) < 12 or password != getpass("Repite la contraseña: "):
            raise SystemExit("Contraseña demasiado corta o confirmación diferente.")
        db.add(Usuario(username=username, password=hash_password(password), rol="Administrador", activo=True))
        db.commit()
    print("Encargado creado. Ya puede iniciar sesión en el dashboard.")


if __name__ == "__main__":
    main()
