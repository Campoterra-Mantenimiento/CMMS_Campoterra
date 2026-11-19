from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# 1. Esquema Base (Los datos comunes que siempre se usan)
class EquipoBase(BaseModel):
    codigo_interno: str
    nombre: str
    area_ubicacion: str
    estado: str = "Operativo"
    notas_adicionales: Optional[str] = None

# 2. Esquema para Crear (Cuando enviamos datos desde un formulario)
class EquipoCreate(EquipoBase):
    pass # Hereda todo lo de EquipoBase sin cambios

# 3. Esquema de Respuesta (Lo que la API le devuelve al Dashboard Web)
class Equipo(EquipoBase):
    id_equipo: int

    class Config:
        from_attributes = True


# ==========================================
# ESQUEMAS PARA CONTROL DE PERSONAL (TÉCNICOS)
# ==========================================
class TecnicoBase(BaseModel):
    nombre: str
    estado: str = "Activo"

class TecnicoCreate(TecnicoBase):
    estado: Optional[str] = "Activo"

class Tecnico(TecnicoBase):
    id_tecnico: int
    
    class Config:
        from_attributes = True


# ==========================================
# ESQUEMAS PARA HISTORIAL DE BITÁCORAS
# ==========================================
class BitacoraResponse(BaseModel):
    id_bitacora: int
    fecha_registro: Optional[datetime] = None
    nombre_equipo: Optional[str] = None
    nombre_area: Optional[str] = None
    nombre_tecnico: Optional[str] = None
    tipo_mantenimiento: str
    descripcion: str
    detalles_repuestos: str | None = None

    class Config:
        from_attributes = True

class AreaBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)

class AreaCreate(AreaBase):
    activa: bool = True

class AreaUpdate(AreaBase):
    pass

class AreaResponse(AreaBase):
    id_area: int
    activa: bool

    class Config:
        from_attributes = True

class PiezaBase(BaseModel):
    nombre: str
    codigo: str
    stock: int
    categoria: str
    icon: str

class PiezaCreate(PiezaBase):
    pass

class PiezaResponse(PiezaBase):
    id_pieza: int
    
    class Config:
        from_attributes = True

class MovimientoPiezaResponse(BaseModel):
    id_movimiento: int
    id_pieza: int
    nombre_pieza: str
    tipo: str
    cantidad: int
    motivo: str
    fecha_movimiento: datetime


class NotificacionResponse(BaseModel):
    id_notificacion: int
    tipo: str
    titulo: str
    mensaje: str
    fecha: datetime
    leida: bool
    enlace: Optional[str] = None
    referencia_id: Optional[int] = None

    class Config:
        from_attributes = True

class NotificacionesResponse(BaseModel):
    notificaciones: list[NotificacionResponse]
    no_leidas: int


class PerfilUsuarioResponse(BaseModel):
    username: str
    rol: str
    nombre: str
    cargo: str


class PerfilUsuarioUpdate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    cargo: str = Field(..., min_length=2, max_length=100)
    contrasena_actual: Optional[str] = Field(default=None, min_length=1, max_length=255)
    nueva_contrasena: Optional[str] = Field(default=None, min_length=8, max_length=128)


class EquipoRegistroCreate(EquipoBase):
    estado: Optional[str] = "Operativo"


class ShiftStartRequest(BaseModel):
    tecnico_id: Optional[int] = None
    turno_id: Optional[int] = None
    tecnico: Optional[str] = None
    turno: Optional[str] = None


class BitacoraCreate(BaseModel):
    id_equipo: Optional[int] = None
    id_area: Optional[int] = None
    id_tecnico: int
    id_turno: int
    tipo_mantenimiento: str
    descripcion: str
    detalles_repuestos: Optional[str] = None


class UsuarioCreate(BaseModel):
    username: str
    password: str
    rol: Optional[str] = "Administrador"


class UsuarioLogin(BaseModel):
    username: str
    password: str


class PiezaReporte(BaseModel):
    partId: int
    qty: int


class NuevoReporteRequest(BaseModel):
    area_id: int
    equipo_id: Optional[int] = None
    tecnico_id: int
    turno_id: int
    tipo_trabajo: str
    descripcion: str
    piezas: List[PiezaReporte]


class AlertaUrgenteRequest(BaseModel):
    linea_detenida: bool
    prioridad: str
    equipo: str
    descripcion: str


class EntradaPiezaRequest(BaseModel):
    cantidad: int
    motivo: str = "Reabastecimiento"