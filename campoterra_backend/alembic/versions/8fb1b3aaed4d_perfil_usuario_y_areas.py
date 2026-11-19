"""perfil_usuario_y_areas

Réplica versionada y explícita de lo que hacían, en cada arranque del
backend, las funciones ``asegurar_columnas_perfil_usuario()`` y
``asegurar_esquema_areas()`` (ya eliminadas de ``main.py``):

- Agrega ``usuarios.nombre`` y ``usuarios.cargo`` (NULL-ables).
- Agrega ``bitacoras.id_area`` (FK a ``areas_mantenimiento``, NULL-able).
- En MySQL, vuelve ``bitacoras.id_equipo`` NULL-able.
- Siembra las áreas de mantenimiento iniciales si no existen todavía.

Todos los pasos son idempotentes (verifican el estado actual antes de
aplicar el cambio), por lo que correr ``alembic upgrade head`` es seguro
incluso si alguna de estas columnas ya existiera por otra vía.

Revision ID: 8fb1b3aaed4d
Revises: 666a25081cd6
Create Date: 2026-10-01 12:27:17.944408

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


# revision identifiers, used by Alembic.
revision: str = '8fb1b3aaed4d'
down_revision: Union[str, Sequence[str], None] = '666a25081cd6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


AREAS_MANTENIMIENTO_INICIALES = (
    "Producción",
    "Túnel",
    "Sanidad",
    "Condensadores",
    "Línea de moras",
    "Línea de limón",
    "Cuarto de lavado",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    columnas_usuarios = {columna["name"] for columna in inspector.get_columns("usuarios")}
    if "nombre" not in columnas_usuarios:
        op.add_column("usuarios", sa.Column("nombre", sa.String(length=100), nullable=True))
    if "cargo" not in columnas_usuarios:
        op.add_column("usuarios", sa.Column("cargo", sa.String(length=100), nullable=True))

    columnas_bitacoras = {columna["name"] for columna in inspector.get_columns("bitacoras")}
    if "id_area" not in columnas_bitacoras:
        op.add_column("bitacoras", sa.Column("id_area", sa.Integer(), nullable=True))

    # La FK se verifica de forma INDEPENDIENTE de si la columna ya existía o
    # se acaba de crear arriba: una base que haya obtenido `id_area` por otro
    # camino (ej. la función ad-hoc vieja, que no siempre la creaba con FK)
    # puede tener la columna sin la restricción. Sin este chequeo separado,
    # el `if` de arriba nunca se ejecutaría para esas bases y la FK quedaría
    # faltante de forma silenciosa.
    #
    # La detección se hace por COLUMNAS + TABLA REFERENCIADA, no por nombre
    # literal de la constraint: una base puede tener una FK equivalente con
    # otro nombre (ej. generada automáticamente por MySQL o por otra
    # herramienta). Comparar solo por nombre no la detectaría, y
    # `create_foreign_key` fallaría al intentar crear una FK redundante
    # sobre la misma columna (o crearía una duplicada innecesaria).
    ya_tiene_fk_equivalente = any(
        list(fk.get("constrained_columns") or []) == ["id_area"]
        and fk.get("referred_table") == "areas_mantenimiento"
        for fk in inspector.get_foreign_keys("bitacoras")
    )
    if not ya_tiene_fk_equivalente:
        op.create_foreign_key(
            "fk_bitacoras_id_area_areas_mantenimiento",
            "bitacoras",
            "areas_mantenimiento",
            ["id_area"],
            ["id_area"],
        )

    if bind.dialect.name == "mysql":
        op.alter_column(
            "bitacoras",
            "id_equipo",
            existing_type=sa.Integer(),
            nullable=True,
        )

    for nombre in AREAS_MANTENIMIENTO_INICIALES:
        existe = bind.execute(
            text("SELECT id_area FROM areas_mantenimiento WHERE nombre = :nombre"),
            {"nombre": nombre},
        ).first()
        if not existe:
            bind.execute(
                text(
                    "INSERT INTO areas_mantenimiento (nombre, activa) "
                    "VALUES (:nombre, :activa)"
                ),
                {"nombre": nombre, "activa": True},
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.alter_column(
            "bitacoras",
            "id_equipo",
            existing_type=sa.Integer(),
            nullable=False,
        )
    op.drop_constraint("fk_bitacoras_id_area_areas_mantenimiento", "bitacoras", type_="foreignkey")
    op.drop_column("bitacoras", "id_area")
    op.drop_column("usuarios", "cargo")
    op.drop_column("usuarios", "nombre")
    bind.execute(text("DELETE FROM areas_mantenimiento WHERE nombre IN :nombres").bindparams(
        sa.bindparam("nombres", expanding=True)
    ), {"nombres": list(AREAS_MANTENIMIENTO_INICIALES)})
