// La URL se externaliza vía variable de entorno EXPO_PUBLIC_API_URL (ver .env.example).
// En desarrollo (__DEV__), si no está definida se usa esta IP local como respaldo
// cómodo para pruebas. En producción NO hay respaldo: si falta la variable, se
// lanza un error claro en vez de apuntar silenciosamente a una IP de desarrollo.
import { USE_SUPABASE } from './backendConfig';
import { supabase, cloudResult, reportPayload } from './supabase';

function resolveBaseUrl() {
  if (USE_SUPABASE) return '';
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredUrl) return configuredUrl;
  if (__DEV__) return 'http://192.168.1.124:8000';
  throw new Error(
    'Falta configurar EXPO_PUBLIC_API_URL para esta compilación. ' +
    'Define la variable antes de compilar; no hay una URL de respaldo en producción.'
  );
}

const BASE_URL = resolveBaseUrl();
let mobileAccessToken = null;
let mobileTechnicianId = null;
export const getMobileTechnicianId = () => mobileAccessToken ? mobileTechnicianId : null;

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail || data.message;
    const message = Array.isArray(detail)
      ? detail.map((item) => `${(item.loc || []).join('.')}: ${item.msg || 'Dato inválido'}`).join('\n')
      : typeof detail === 'string' ? detail : `Error del servidor (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
};

const authenticatedFetch = (url, options = {}) => {
  if (!mobileAccessToken) {
    throw new Error('La sesión móvil no está disponible. Inicia la jornada nuevamente.');
  }
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${mobileAccessToken}`,
  };
  return fetch(url, { ...options, headers }).then((response) => {
    if (response.status === 401) clearMobileSession();
    return response;
  });
};

export const clearMobileSession = () => {
  mobileAccessToken = null;
  mobileTechnicianId = null;
};

export const startShift = async (tecnico, turno) => {
  if (USE_SUPABASE) {
    // Selección local: permite capturar con catálogos guardados cuando no hay red.
    // El servidor vuelve a validar técnico/turno al recibir el reporte.
    mobileTechnicianId = tecnico.id_tecnico;
    mobileAccessToken = 'device-session';
    return { status: 'success' };
  }
  const response = await fetch(`${BASE_URL}/api/shift/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tecnico_id: tecnico.id_tecnico,
      turno_id: turno.id_turno,
    }),
  });
  const data = await parseResponse(response);
  if (!data.access_token) throw new Error('El servidor no devolvió un token de sesión para la jornada.');
  mobileAccessToken = data.access_token;
  mobileTechnicianId = tecnico.id_tecnico;
  return data;
};

export const getShiftOptions = async () => {
  if (USE_SUPABASE) {
    await cloudResult(supabase.rpc('acceso_dispositivo'));
    const [tecnicos, turnos] = await Promise.all([
      cloudResult(supabase.from('tecnicos').select('id_tecnico,nombre').eq('estado', 'Activo').order('nombre')),
      cloudResult(supabase.from('turnos').select('*').order('id_turno')),
    ]);
    return { tecnicos, turnos: turnos.map(t => ({ ...t, etiqueta: `${t.descripcion} (${t.hora_inicio.slice(0, 5)} a ${t.hora_fin.slice(0, 5)})` })) };
  }
  const response = await fetch(`${BASE_URL}/api/shift/options`);
  return parseResponse(response);
};

export const submitNewReport = async (reportData, idempotencyKey, capturedAt) => {
  if (USE_SUPABASE) {
    if (String(reportData.tecnico_id) !== String(getMobileTechnicianId())) throw new Error('La jornada no corresponde al reporte.');
    return cloudResult(supabase.rpc('registrar_reporte', {
      p_clave: idempotencyKey, p_reporte: reportPayload(reportData, capturedAt),
    }));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
  const response = await authenticatedFetch(`${BASE_URL}/api/reports/new`, {
    signal: controller.signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(reportData),
  });
  return await parseResponse(response);
  } finally {
    clearTimeout(timeout);
  }
};

export const getEquipos = async () => {
  if (USE_SUPABASE) return cloudResult(supabase.from('equipos').select('*').order('nombre'));
  const response = await authenticatedFetch(`${BASE_URL}/api/equipos/`);
  return parseResponse(response);
};

export const getMaintenanceAreas = async () => {
  if (USE_SUPABASE) return cloudResult(supabase.from('areas_mantenimiento').select('id_area,nombre').eq('activa', true).order('nombre'));
  const response = await authenticatedFetch(`${BASE_URL}/api/areas-mantenimiento`);
  return parseResponse(response);
};

export const getDashboardStats = async () => {
  const response = await authenticatedFetch(`${BASE_URL}/api/dashboard/stats`);
  return parseResponse(response);
};

export const getPiezas = async () => {
  if (USE_SUPABASE) return cloudResult(supabase.from('piezas').select('*').order('nombre'));
  const response = await authenticatedFetch(`${BASE_URL}/api/piezas/`);
  return parseResponse(response);
};
