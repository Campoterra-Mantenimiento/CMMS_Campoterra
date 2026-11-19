"""Agrega solo la FK de bitacoras.id_area; no cambia el historial de Alembic.

Uso: python scripts/repair_area_fk.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, inspect, text

from config import build_database_url


def repair_area_fk(connection):
    inspector = inspect(connection)
    fks = inspector.get_foreign_keys("bitacoras")
    for fk in fks:
        if (
            fk.get("constrained_columns") == ["id_area"]
            and fk.get("referred_table") == "areas_mantenimiento"
            and fk.get("referred_columns") == ["id_area"]
            and fk.get("referred_schema") in (None, connection.engine.url.database)
        ):
            return False

    columns = {column["name"] for column in inspector.get_columns("bitacoras")}
    if "id_area" not in columns:
        raise RuntimeError("Falta bitacoras.id_area. Aplica las migraciones de esquema primero.")

    orphan = connection.execute(text(
        "SELECT b.id_bitacora FROM bitacoras b "
        "LEFT JOIN areas_mantenimiento a ON a.id_area = b.id_area "
        "WHERE b.id_area IS NOT NULL AND a.id_area IS NULL LIMIT 1"
    )).first()
    if orphan is not None:
        raise RuntimeError(
            "Hay bitácoras con áreas inexistentes. Revisa esas referencias antes de "
            "reintentar; no se borraron ni corrigieron datos automáticamente."
        )

    connection.execute(text(
        "ALTER TABLE bitacoras ADD CONSTRAINT "
        "fk_bitacoras_id_area_areas_mantenimiento "
        "FOREIGN KEY (id_area) REFERENCES areas_mantenimiento (id_area)"
    ))
    return True


def main():
    engine = create_engine(build_database_url())
    try:
        with engine.begin() as connection:
            changed = repair_area_fk(connection)
        print("FK agregada; datos e historial Alembic conservados." if changed
              else "La FK equivalente ya existe; no se hicieron cambios.")
        return 0
    except Exception as error:
        print(f"[ERROR] No se pudo reparar la FK: {error}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
