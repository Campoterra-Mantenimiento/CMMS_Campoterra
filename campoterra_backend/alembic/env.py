import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy import pool

from alembic import context

# Permite que `import config`/`import models` funcione sin importar desde
# dónde se invoque `alembic` (coincide con cómo main.py importa estos
# módulos como top-level dentro de campoterra_backend).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import models  # noqa: E402  (orden requerido tras ajustar sys.path)
from config import build_database_url  # noqa: E402

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Reutilizamos la misma lógica de credenciales que usa la app (config.py), en
# vez de duplicarla o leer sqlalchemy.url desde alembic.ini. La URL se guarda
# como objeto `URL` (no como texto vía config.set_main_option), porque
# contraseñas con caracteres especiales (p. ej. "%" o "!") quedan percent-
# encoded y romperían el parser de interpolación de `configparser` usado por
# alembic.ini.
DATABASE_URL = build_database_url()

# target_metadata apunta a los modelos reales de la app para que
# `alembic revision --autogenerate` detecte cambios de esquema futuros.
target_metadata = models.Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    context.configure(
        url=DATABASE_URL.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = create_engine(DATABASE_URL, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

