"""Restaura la base de datos MySQL local de Campoterra desde un dump.

Uso:
    python scripts/restore_db.py backups/campoterra_<db>_<timestamp>.sql
    python scripts/restore_db.py            # lista los respaldos disponibles

ADVERTENCIA: esta operación es DESTRUCTIVA. Sobrescribe el contenido actual
de la base de datos configurada en el ``.env`` con el contenido del dump.
Por eso pide una confirmación explícita (escribir la palabra ``CONFIRMAR``)
antes de ejecutar nada, salvo que se pase ``--yes`` (pensado solo para
pruebas automatizadas, nunca para uso manual contra datos reales).

Las credenciales se obtienen igual que en ``backup_db.py``: desde
``config.build_database_url()`` y nunca se imprimen ni se pasan como
argumento de línea de comandos.

La base de datos destino SIEMPRE es la configurada en el ``.env`` activo
(la conexión), nunca un nombre leído del contenido del dump: el cliente
``mysql`` se invoca indicando explícitamente esa base como argumento
(``mysql ... <base_destino>``). Como defensa adicional, si el dump contiene
una sentencia ``CREATE DATABASE``/``USE`` que referencie un nombre de base
distinto al destino configurado (por ejemplo, un dump viejo generado antes
de este cambio, o un dump de otra herramienta), la restauración se ABORTA
con un error explícito en vez de ejecutarse silenciosamente contra la base
equivocada.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import build_database_url  # noqa: E402
from scripts.backup_db import BACKUPS_DIR, _write_defaults_extra_file  # noqa: E402


_PATRON_DB_EN_DUMP = re.compile(
    r"^\s*(?:CREATE\s+DATABASE[^;]*?|USE)\s+(?:`([^`]+)`|([A-Za-z0-9_$]+))\s*;?\s*$",
    re.IGNORECASE,
)


def _detectar_bases_referenciadas(dump_bytes: bytes) -> set[str]:
    """Busca sentencias CREATE DATABASE/USE dentro de un dump.

    Los dumps generados por ``backup_db.py`` (con ``--no-create-db`` y sin
    ``--databases``) NO deberían contener estas sentencias. Si un dump
    externo o generado antes de este cambio sí las trae, esto permite
    detectar a qué base de datos apuntan para compararla contra el destino
    real antes de restaurar.
    """
    texto = dump_bytes.decode("utf-8", errors="replace")
    bases: set[str] = set()
    for linea in texto.splitlines():
        coincidencia = _PATRON_DB_EN_DUMP.match(linea)
        if coincidencia:
            bases.add(coincidencia.group(1) or coincidencia.group(2))
    return bases


def listar_backups() -> list[Path]:
    if not BACKUPS_DIR.exists():
        return []
    return sorted(BACKUPS_DIR.glob("*.sql"))


def restore_db(dump_path: Path) -> None:
    if not dump_path.exists():
        raise FileNotFoundError(f"No existe el archivo de respaldo: {dump_path}")

    url = build_database_url()
    if not url.database:
        raise RuntimeError("No se pudo determinar el nombre de la base de datos a restaurar.")

    dump_bytes = dump_path.read_bytes()

    bases_referenciadas = _detectar_bases_referenciadas(dump_bytes)
    bases_distintas = bases_referenciadas - {url.database}
    if bases_distintas:
        raise RuntimeError(
            "El dump contiene sentencias CREATE DATABASE/USE que referencian "
            f"una base distinta a la destino ({', '.join(sorted(bases_distintas))} "
            f"!= '{url.database}'). Por seguridad, la restauración se aborta: "
            "este dump sobrescribiría silenciosamente la base original en vez "
            "de la base configurada en el .env activo. Genera un dump nuevo "
            "con backup_db.py (que ya no incluye estas sentencias) o edita el "
            "dump manualmente si estás seguro de lo que haces."
        )

    cred_file = _write_defaults_extra_file(
        user=url.username or "",
        password=url.password or "",
        host=url.host or "localhost",
        port=url.port or 3306,
    )

    mysql_bin = os.environ.get("CAMPOTERRA_MYSQL_BIN", "mysql")

    try:
        resultado = subprocess.run(
            [mysql_bin, f"--defaults-extra-file={cred_file}", url.database],
            input=dump_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    finally:
        cred_file.unlink(missing_ok=True)

    if resultado.returncode != 0:
        mensaje = resultado.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"mysql (restauración) falló (código {resultado.returncode}): {mensaje}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dump",
        nargs="?",
        help="Ruta al archivo .sql a restaurar. Si se omite, se listan los respaldos disponibles.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Omite la confirmación interactiva (solo para scripts/pruebas automatizadas).",
    )
    args = parser.parse_args(argv)

    if not args.dump:
        disponibles = listar_backups()
        if not disponibles:
            print(f"No hay respaldos en {BACKUPS_DIR}.")
            return 1
        print("Respaldos disponibles:")
        for ruta in disponibles:
            print(f"  - {ruta}")
        print("\nVuelve a ejecutar indicando la ruta del respaldo a restaurar.")
        return 0

    dump_path = Path(args.dump)
    url = build_database_url()

    if not args.yes:
        print(
            f"ADVERTENCIA: esto SOBRESCRIBIRÁ por completo la base de datos "
            f"'{url.database}' en '{url.host}' con el contenido de:\n  {dump_path}\n"
            f"Esta acción NO se puede deshacer."
        )
        respuesta = input("Escribe CONFIRMAR para continuar: ").strip()
        if respuesta != "CONFIRMAR":
            print("Restauración cancelada.")
            return 1

    try:
        restore_db(dump_path)
    except Exception as error:  # noqa: BLE001 - queremos reportar cualquier falla al usuario
        print(f"[ERROR] No se pudo restaurar el respaldo: {error}", file=sys.stderr)
        return 1

    print(f"Base de datos '{url.database}' restaurada desde {dump_path}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
