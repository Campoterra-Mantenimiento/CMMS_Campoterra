from fastapi import APIRouter

router = APIRouter(tags=[])


@router.get("/")
def ruta_raiz():
    return {"mensaje": "¡El servidor de Campoterra está en línea!"}
