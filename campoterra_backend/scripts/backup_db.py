"""Genera un respaldo (dump) de la base de datos MySQL local de Campoterra.

Uso:
    python scripts/backup_db.py

El respaldo se guarda en ``campoterra_backend/backups/`` con un nombre que
incluye el nombre de la base de datos y la fecha/hora (``AAAAMMDD_HHMMSS``).
La carpeta ``backups/`` está excluida de git: los dumps NUNCA deben
versionarse porque pueden contener datos reales.

Las credenciales se obtienen de las mismas variables de entorno que usa el
backend (``CAMPOTERRA_DB_*``, vía ``config.build_database_url()``) y nunca se
imprimen en pantalla ni se pasan como argumento de línea de comandos: se
escriben en un archivo temporal ``--defaults-extra-file`` que ``mysqldump``
lee directamente y que se borra al finalizar (incluso si el comando falla).

Requiere tener el cliente ``mysqldump`` de MySQL instalable en el PATH del
sistema (se instala junto con el servidor de MySQL o con el "MySQL Shell" /
"MySQL Client" independiente). Las variables de entorno opcionales
``CAMPOTERRA_MYSQLDUMP_BIN`` permiten apuntar a un binario distinto (usado,
por ejemplo, para pruebas automatizadas).

IMPORTANTE sobre el formato del dump: se genera SIN ``--databases`` (con
``--no-create-db``), por lo que el archivo resultante NO incluye sentencias
``CREATE DATABASE``/``USE <nombre>``. Esto es intencional: la base de datos
destino de una restauración la decide SIEMPRE la conexión usada por
``restore_db.py`` (el ``.env`` activo), nunca el contenido del dump. Así se
evita que un dump generado para una base "A" sobrescriba silenciosamente esa
misma base "A" aunque el usuario haya apuntado sus credenciales a una base
"B" distinta para probar la restauración.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import build_database_url  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
BACKUPS_DIR = BACKEND_DIR / "backups"


def _write_defaults_extra_file(user: str, password: str, host: str, port: int) -> Path:
    """Escribe credenciales en un archivo temporal que mysqldump puede leer.

    Evita exponer la contraseña como argumento de línea de comandos (visible
    en el listado de procesos del sistema) o en la salida de la consola.
    """
    fd, path = tempfile.mkstemp(prefix="campoterra_mysql_", suffix=".cnf")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as archivo:
            archivo.write("[client]\n")
            archivo.write(f"user={user}\n")
            archivo.write(f"password={password}\n")
            archivo.write(f"host={host}\n")
            archivo.write(f"port={port}\n")
    except Exception:
        os.unlink(path)
        raise
    return Path(path)


def backup_db() -> Path:
    url = build_database_url()
    if not url.database:
        raise RuntimeError("No se pudo determinar el nombre de la base de datos a respaldar.")

    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

    cred_file = _write_defaults_extra_file(
        user=url.username or "",
        password=url.password or "",
        host=url.host or "localhost",
        port=url.port or 3306,
    )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    destino = BACKUPS_DIR / f"campoterra_{url.database}_{timestamp}.sql"

    mysqldump_bin = os.environ.get("CAMPOTERRA_MYSQLDUMP_BIN", "mysqldump")

    try:
        with open(destino, "wb") as salida:
            resultado = subprocess.run(
                [
                    mysqldump_bin,
                    f"--defaults-extra-file={cred_file}",
                    "--single-transaction",
                    "--routines",
                    "--triggers",
                    "--no-create-db",
                    url.database,
                ],
                stdout=salida,
                stderr=subprocess.PIPE,
            )
    finally:
        cred_file.unlink(missing_ok=True)

    if resultado.returncode != 0:
        destino.unlink(missing_ok=True)
        mensaje = resultado.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"mysqldump falló (código {resultado.returncode}): {mensaje}")

    return destino


def main() -> int:
    try:
        destino = backup_db()
    except Exception as error:  # noqa: BLE001 - queremos reportar cualquier falla al usuario
        print(f"[ERROR] No se pudo generar el respaldo: {error}", file=sys.stderr)
        return 1

    tamano_kb = destino.stat().st_size / 1024
    print(f"Respaldo creado: {destino} ({tamano_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
