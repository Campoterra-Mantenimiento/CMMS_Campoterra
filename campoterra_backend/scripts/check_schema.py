"""Diagnóstico de solo lectura antes de adoptar Alembic.

Uso: python scripts/check_schema.py
Salida: 0 compatible/vacía; 2 requiere revisión; 1 error de inspección.
No ejecuta stamp, migraciones ni reparaciones.
"""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

AREAS_INICIALES = (
    "Producción", "Túnel", "Sanidad", "Condensadores",
    "Línea de moras", "Línea de limón", "Cuarto de lavado",
)
# La adopción se limita a la revisión auditada, nunca a futuras migraciones.
REVISION_ADOPCION = "8fb1b3aaed4d"


def inspeccionar(connection, metadata):
    from sqlalchemy import inspect, text
    from alembic.migration import MigrationContext
    from alembic.autogenerate import compare_metadata

    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    context = MigrationContext.configure(connection, opts={
        "compare_type": True,
        # Los modelos usan defaults Python; no equivalen a defaults SQL.
        "compare_server_default": False,
    })
    revisions = tuple(context.get_current_heads())
    problems = []
    if not tables - {"alembic_version"}:
        return {"empty": not revisions, "revisions": revisions,
                "problems": ["Hay historial Alembic pero faltan las tablas."] if revisions else []}

    # Incluye tablas, columnas, tipos, nulabilidad, índices, UNIQUE y FKs.
    for difference in compare_metadata(context, metadata):
        problems.append(f"Diferencia de esquema: {difference}")

    # Alembic autogenerate no cubre todos los cambios de claves primarias.
    for table in metadata.sorted_tables:
        if table.name in tables:
            actual = inspector.get_pk_constraint(table.name).get("constrained_columns") or []
            expected = [column.name for column in table.primary_key.columns]
            if actual != expected:
                problems.append(f"Clave primaria distinta en {table.name}: {actual}; esperada {expected}.")

    if "areas_mantenimiento" in tables:
        columns = {c["name"] for c in inspector.get_columns("areas_mantenimiento")}
        if "nombre" in columns:
            names = set(connection.execute(text("SELECT nombre FROM areas_mantenimiento")).scalars())
            missing = sorted(set(AREAS_INICIALES) - names)
            if missing:
                problems.append("Faltan áreas iniciales: " + ", ".join(missing))
        else:
            problems.append("No se pueden verificar las áreas iniciales: falta nombre.")
    else:
        problems.append("Falta el catálogo de áreas iniciales.")
    return {"empty": False, "revisions": revisions, "problems": problems}


def recomendar(result):
    if result["problems"]:
        print("Se requiere revisión; no se recomienda marcar migraciones como aplicadas.")
        for problem in result["problems"]:
            print(f"  - {problem}")
        print("No se modificó la base de datos ni su historial.")
        print("Si el único pendiente es la FK de bitacoras.id_area, puedes usar:")
        print("   python scripts/repair_area_fk.py")
        print("Para otros pendientes, prepara una migración hacia adelante y vuelve a verificar.")
        return 2
    if result["empty"]:
        print("Base vacía y sin historial: python -m alembic upgrade head")
        return 0
    if result["revisions"]:
        print("Ya existe historial Alembic: " + ", ".join(result["revisions"]))
        print("No lo reemplaces con stamp. Revisa las migraciones pendientes antes de actualizar.")
        return 0
    print("Sin diferencias en las comprobaciones de esquema y áreas iniciales.")
    print("No se comprueban defaults SQL, triggers, vistas ni procedimientos almacenados.")
    print("Tras revisar esos elementos y respaldar, la adopción de la revisión auditada es:")
    print(f"   python -m alembic stamp {REVISION_ADOPCION}")
    return 0


def diagnosticar():
    from sqlalchemy import create_engine
    from config import build_database_url
    from models import Base

    engine = create_engine(build_database_url())
    try:
        with engine.connect() as connection:
            result = inspeccionar(connection, Base.metadata)
        return recomendar(result)
    finally:
        engine.dispose()


def main():
    try:
        return diagnosticar()
    except Exception as error:
        print(f"[ERROR] No se pudo completar la inspección: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
