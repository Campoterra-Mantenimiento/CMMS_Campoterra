from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import validate_token_secret_at_startup
from routers import areas, bitacoras, dashboard, equipos, general, inventario, reportes, seguridad, tecnicos, turnos

validate_token_secret_at_startup()

app = FastAPI(title="API Campoterra CMMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# El esquema de la base de datos ahora se gestiona con Alembic
# (ver campoterra_backend/alembic/ y el README). Ya no se crea ni se
# "repara" aquí en cada arranque: corre `alembic upgrade head` para
# aplicar las migraciones pendientes.

app.include_router(general.router)
app.include_router(turnos.router)
app.include_router(seguridad.router)
app.include_router(areas.router)
app.include_router(equipos.router)
app.include_router(tecnicos.router)
app.include_router(bitacoras.router)
app.include_router(reportes.router)
app.include_router(dashboard.router)
app.include_router(inventario.router)
