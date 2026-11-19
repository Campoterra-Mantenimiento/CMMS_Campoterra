"""baseline_schema

Representa el esquema EXACTO que generaba ``models.Base.metadata.create_all()``
antes de que existieran las funciones ad-hoc ``asegurar_columnas_perfil_usuario()``
y ``asegurar_esquema_areas()`` en ``main.py``: es decir, sin las columnas
``usuarios.nombre``/``usuarios.cargo``, sin ``bitacoras.id_area`` y con
``bitacoras.id_equipo`` todavía NOT NULL. Esos cambios quedan cubiertos por la
revisión siguiente (``perfil_usuario_y_areas``), que replica exactamente lo
que hacían esas dos funciones.

Procedimiento de adopción para una base de datos existente:
- Si tu base ya corrió el backend con esas funciones ad-hoc (el caso normal,
  porque corrían en cada arranque): NO ejecutes esta migración directamente.
  En su lugar corre ``alembic stamp head`` para marcar todo como aplicado.
- Si tienes una base con el esquema viejo (sin esas columnas): corre
  ``alembic stamp <esta_revision>`` y luego ``alembic upgrade head`` para que
  solo se aplique el ALTER faltante de la siguiente revisión.
- Si es una base nueva/vacía: simplemente ``alembic upgrade head``.

Ver el README del backend para el procedimiento completo.

Revision ID: 666a25081cd6
Revises:
Create Date: 2026-10-01 12:27:17.475747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '666a25081cd6'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Crea el esquema base (equivalente a create_all() antes de los ALTER ad-hoc)."""
    op.create_table(
        "equipos",
        sa.Column("id_equipo", sa.Integer(), primary_key=True),
        sa.Column("codigo_interno", sa.String(length=50), unique=True),
        sa.Column("nombre", sa.String(length=100)),
        sa.Column("area_ubicacion", sa.String(length=100)),
        sa.Column("estado", sa.String(length=50), server_default="Operativo"),
        sa.Column("notas_adicionales", sa.String(length=255)),
    )
    op.create_index(op.f("ix_equipos_id_equipo"), "equipos", ["id_equipo"], unique=False)

    op.create_table(
        "tecnicos",
        sa.Column("id_tecnico", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(length=100)),
        sa.Column("estado", sa.String(length=50), server_default="Activo"),
    )
    op.create_index(op.f("ix_tecnicos_id_tecnico"), "tecnicos", ["id_tecnico"], unique=False)

    op.create_table(
        "turnos",
        sa.Column("id_turno", sa.Integer(), primary_key=True),
        sa.Column("descripcion", sa.String(length=50)),
        sa.Column("hora_inicio", sa.String(length=10)),
        sa.Column("hora_fin", sa.String(length=10)),
    )
    op.create_index(op.f("ix_turnos_id_turno"), "turnos", ["id_turno"], unique=False)

    op.create_table(
        "areas_mantenimiento",
        sa.Column("id_area", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(length=100), nullable=False, unique=True),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index(op.f("ix_areas_mantenimiento_id_area"), "areas_mantenimiento", ["id_area"], unique=False)

    op.create_table(
        "bitacoras",
        sa.Column("id_bitacora", sa.Integer(), primary_key=True),
        sa.Column("id_equipo", sa.Integer(), sa.ForeignKey("equipos.id_equipo"), nullable=False),
        sa.Column("id_tecnico", sa.Integer(), sa.ForeignKey("tecnicos.id_tecnico")),
        sa.Column("id_turno", sa.Integer(), sa.ForeignKey("turnos.id_turno")),
        sa.Column("tipo_mantenimiento", sa.String(length=50)),
        sa.Column("descripcion", sa.Text()),
        sa.Column("detalles_repuestos", sa.Text()),
        sa.Column("fecha_registro", sa.TIMESTAMP()),
    )
    op.create_index(op.f("ix_bitacoras_id_bitacora"), "bitacoras", ["id_bitacora"], unique=False)

    op.create_table(
        "usuarios",
        sa.Column("id_usuario", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=50), unique=True, index=True),
        sa.Column("password", sa.String(length=255)),
        sa.Column("rol", sa.String(length=50), server_default="Administrador"),
        sa.Column("activo", sa.Boolean(), server_default=sa.true()),
    )
    op.create_index(op.f("ix_usuarios_id_usuario"), "usuarios", ["id_usuario"], unique=False)

    op.create_table(
        "piezas",
        sa.Column("id_pieza", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("codigo", sa.String(length=50), nullable=False, unique=True),
        sa.Column("stock", sa.Integer(), server_default="0"),
        sa.Column("categoria", sa.String(length=50), server_default="General"),
        sa.Column("icon", sa.String(length=50), server_default="cog-outline"),
    )
    op.create_index(op.f("ix_piezas_id_pieza"), "piezas", ["id_pieza"], unique=False)

    op.create_table(
        "movimientos_piezas",
        sa.Column("id_movimiento", sa.Integer(), primary_key=True),
        sa.Column("id_pieza", sa.Integer(), sa.ForeignKey("piezas.id_pieza"), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("motivo", sa.String(length=255), nullable=False),
        sa.Column("fecha_movimiento", sa.TIMESTAMP(), nullable=False),
    )
    op.create_index(op.f("ix_movimientos_piezas_id_movimiento"), "movimientos_piezas", ["id_movimiento"], unique=False)

    op.create_table(
        "reportes_idempotencia",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False, unique=True, index=True),
        sa.Column("tecnico_id", sa.Integer(), nullable=False),
        sa.Column("response_message", sa.String(length=255), nullable=False),
        sa.Column("response_folio", sa.Integer(), nullable=False),
    )
    op.create_index(op.f("ix_reportes_idempotencia_id"), "reportes_idempotencia", ["id"], unique=False)

    op.create_table(
        "notificaciones",
        sa.Column("id_notificacion", sa.Integer(), primary_key=True),
        sa.Column("tipo", sa.String(length=50), nullable=False, server_default="informativa"),
        sa.Column("titulo", sa.String(length=150), nullable=False),
        sa.Column("mensaje", sa.Text(), nullable=False),
        sa.Column("fecha", sa.TIMESTAMP(), nullable=False),
        sa.Column("leida", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enlace", sa.String(length=255)),
        sa.Column("referencia_id", sa.Integer()),
    )
    op.create_index(op.f("ix_notificaciones_id_notificacion"), "notificaciones", ["id_notificacion"], unique=False)
    op.create_index(op.f("ix_notificaciones_leida"), "notificaciones", ["leida"], unique=False)


def downgrade() -> None:
    """Elimina todo el esquema base (orden inverso por dependencias de FK)."""
    op.drop_table("notificaciones")
    op.drop_table("reportes_idempotencia")
    op.drop_table("movimientos_piezas")
    op.drop_table("piezas")
    op.drop_table("usuarios")
    op.drop_table("bitacoras")
    op.drop_table("areas_mantenimiento")
    op.drop_table("turnos")
    op.drop_table("tecnicos")
    op.drop_table("equipos")
