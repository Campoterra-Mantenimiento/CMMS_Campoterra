export const USE_SUPABASE = process.env.EXPO_PUBLIC_BACKEND === 'supabase';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
export const DEVICE_ID = process.env.EXPO_PUBLIC_SUPABASE_DEVICE_ID || '';
if (USE_SUPABASE && (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SUPABASE_URL)
    || !SUPABASE_KEY.startsWith('sb_publishable_')
    || !/^[0-9a-f-]{36}$/.test(DEVICE_ID))) {
  throw new Error('Falta configurar la URL, clave pública o identificador de la tablet de Supabase.');
}
// Nunca mezclar pendientes de MySQL con IDs de otro proyecto/dispositivo.
export const OFFLINE_DATABASE = USE_SUPABASE
  ? `campoterra-${SUPABASE_URL.split('//')[1].split('.')[0]}-${DEVICE_ID}.db`
  : 'campoterra-offline.db';
