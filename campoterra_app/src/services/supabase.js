import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { USE_SUPABASE, SUPABASE_URL, SUPABASE_KEY, DEVICE_ID } from './backendConfig';

const storage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort);
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), 20000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', forwardAbort); }
}
export const supabase = USE_SUPABASE ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock },
  global: { fetch: timedFetch },
}) : null;

export async function authorizeDevice(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  if (data.user?.id !== DEVICE_ID) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('Usa la cuenta de la tablet, no la del encargado ni otro dispositivo.');
  }
  const { data: access, error: accessError } = await supabase.rpc('acceso_dispositivo');
  if (accessError || !access?.autorizado) {
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error(accessError?.message || 'La tablet no está autorizada. Consulta al encargado.');
  }
  return data.session;
}

export async function cloudResult(query) {
  const { data, error, status } = await query;
  if (error) {
    const failure = new Error(error.message || 'No se pudo conectar con Supabase.');
    failure.status = status || undefined;
    // La cola debe pausar por sesión/dispositivo, no agotar cinco intentos.
    if (status === 401 || status === 403) {
      failure.status = 401;
      await supabase.auth.signOut({ scope: 'local' });
    }
    throw failure;
  }
  return data;
}

export function reportPayload(report, capturedAt) {
  if (!capturedAt) throw new Error('El reporte no tiene fecha local de captura.');
  const tipo = { preventivo: 'Preventivo', correctivo: 'Correctivo' }[String(report.tipo_trabajo).toLowerCase()];
  if (!tipo) throw new Error('Tipo de mantenimiento inválido.');
  return {
    tecnico_id: report.tecnico_id, turno_id: report.turno_id, area_id: report.area_id,
    equipo_id: report.equipo_id ?? null, tipo_trabajo: tipo,
    descripcion: report.descripcion, piezas: report.piezas.map(({ partId, qty }) => ({ partId, qty })),
    fecha_registro: capturedAt,
  };
}
