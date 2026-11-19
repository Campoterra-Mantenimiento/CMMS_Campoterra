from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from config import build_database_url


SQLALCHEMY_DATABASE_URL = build_database_url()

# Creamos el motor de conexi�n
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Configuramos la sesi�n
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Clase base de la que heredar�n los modelos de las tablas
Base = declarative_base()

# Dependencia para inyectar la conexi�n de la BD en cada petici�n a la API
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
