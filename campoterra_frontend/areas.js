const AREAS_API = 'http://localhost:8000/api/areas';
let areas = [];
let areaModal;

function mostrarError(mensaje) {
    const elemento = document.getElementById('errorMessage');
    elemento.textContent = mensaje;
    elemento.style.display = 'block';
}

function limpiarError() {
    document.getElementById('errorMessage').style.display = 'none';
}

async function respuestaJson(respuesta) {
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.detail || 'No se pudo completar la operación.');
    return datos;
}

async function cargarAreas() {
    limpiarError();
    try {
        const respuesta = await authenticatedFetch(AREAS_API);
        areas = await respuestaJson(respuesta);
        const cuerpo = document.querySelector('#tablaAreas tbody');
        cuerpo.innerHTML = '';
        areas.forEach(area => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td class="fw-bold">#${area.id_area}</td>
                <td>${escapeHtml(area.nombre)}</td>
                <td><span class="badge ${area.activa ? 'bg-success' : 'bg-secondary'}">${area.activa ? 'Activa' : 'Inactiva'}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-secondary me-1" data-action="edit" data-id="${area.id_area}"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm ${area.activa ? 'btn-outline-warning' : 'btn-outline-success'}" data-action="status" data-id="${area.id_area}">
                        ${area.activa ? 'Desactivar' : 'Activar'}
                    </button>
                </td>`;
            cuerpo.appendChild(fila);
        });
    } catch (error) {
        mostrarError(error.message);
    }
}

function abrirNuevaArea() {
    document.getElementById('areaForm').reset();
    document.getElementById('areaId').value = '';
    document.getElementById('modalTitle').textContent = 'Nueva área';
    areaModal.show();
}

function abrirEdicion(area) {
    document.getElementById('areaId').value = area.id_area;
    document.getElementById('areaName').value = area.nombre;
    document.getElementById('modalTitle').textContent = 'Editar área';
    areaModal.show();
}

async function guardarArea(event) {
    event.preventDefault();
    limpiarError();
    const id = document.getElementById('areaId').value;
    const nombre = document.getElementById('areaName').value.trim();
    try {
        const respuesta = await authenticatedFetch(id ? `${AREAS_API}/${id}` : AREAS_API, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });
        await respuestaJson(respuesta);
        areaModal.hide();
        await cargarAreas();
    } catch (error) {
        mostrarError(error.message);
    }
}

async function cambiarEstado(area) {
    const accion = area.activa ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Deseas ${accion} el área "${area.nombre}"?`)) return;
    try {
        const respuesta = await authenticatedFetch(`${AREAS_API}/${area.id_area}/status?activa=${!area.activa}`, { method: 'PATCH' });
        await respuestaJson(respuesta);
        await cargarAreas();
    } catch (error) {
        mostrarError(error.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    areaModal = new bootstrap.Modal(document.getElementById('areaModal'));
    document.getElementById('btnNuevaArea').addEventListener('click', abrirNuevaArea);
    document.getElementById('areaForm').addEventListener('submit', guardarArea);
    document.querySelector('#tablaAreas tbody').addEventListener('click', event => {
        const boton = event.target.closest('button[data-action]');
        if (!boton) return;
        const area = areas.find(item => item.id_area === Number(boton.dataset.id));
        if (boton.dataset.action === 'edit') abrirEdicion(area);
        if (boton.dataset.action === 'status') cambiarEstado(area);
    });
    cargarAreas();
});
