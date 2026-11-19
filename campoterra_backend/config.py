"""Environment-backed settings shared by the backend."""

import os
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv
from sqlalchemy.engine import URL


ENVIRONMENT = os.getenv("CAMPOTERRA_ENV", "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT in {"production", "prod"}

if not IS_PRODUCTION:
    load_dotenv(Path(__file__).resolve().with_name(".env"), override=False)
    if os.getenv("CAMPOTERRA_ENV", "").strip().lower() in {"production", "prod"}:
        raise RuntimeError(
            "CAMPOTERRA_ENV=production debe configurarse en el entorno del proceso, "
            "no en el archivo .env."
        )


def build_database_url(environment: Mapping[str, str] = os.environ) -> URL:
    host = environment.get("CAMPOTERRA_DB_HOST", "")
    database = environment.get("CAMPOTERRA_DB_NAME", "")
    username = environment.get("CAMPOTERRA_DB_USER", "")
    password = environment.get("CAMPOTERRA_DB_PASSWORD", "")
    required = {
        "CAMPOTERRA_DB_HOST": host,
        "CAMPOTERRA_DB_NAME": database,
        "CAMPOTERRA_DB_USER": username,
        "CAMPOTERRA_DB_PASSWORD": password,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        names = ", ".join(missing)
        raise RuntimeError(
            f"Faltan variables de entorno requeridas para la base de datos: {names}"
        )

    port_value = environment.get("CAMPOTERRA_DB_PORT", "3306")
    try:
        port = int(port_value)
    except ValueError as error:
        raise RuntimeError("CAMPOTERRA_DB_PORT debe ser un entero.") from error

    return URL.create(
        drivername="mysql+pymysql",
        username=username,
        password=password,
        host=host,
        port=port,
        database=database,
    )
