const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function service(id = 'tablet', denied = false) {
  let signedOut = false;
  const fake = { auth: {
    signInWithPassword: async () => ({ data: { user: { id }, session: { user: { id } } } }),
    signOut: async () => { signedOut = true; },
  }, rpc: async () => denied ? { error: { message: 'Revocada' } } : { data: { autorizado: true } } };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/supabase.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ USE_SUPABASE: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_KEY: 'public', DEVICE_ID: 'tablet',
    createClient: () => fake, processLock: () => {}, SecureStore: {}, AbortController, setTimeout, clearTimeout });
  vm.runInContext(source + '\nglobalThis.api = { authorizeDevice, cloudResult, reportPayload };', context);
  return { ...context.api, signedOut: () => signedOut };
}
test('configuración rechaza cuenta del encargado y dispositivo revocado', async () => {
  const wrong = service('boss');
  await assert.rejects(wrong.authorizeDevice('a@b.com', 'not-a-real-password'), /cuenta de la tablet/);
  assert.equal(wrong.signedOut(), true);
  const revoked = service('tablet', true);
  await assert.rejects(revoked.authorizeDevice('a@b.com', 'not-a-real-password'), /Revocada/);
  assert.equal(revoked.signedOut(), true);
  assert.equal((await service().authorizeDevice('a@b.com', 'not-a-real-password')).user.id, 'tablet');
});
test('report payload conserva fecha de captura y no transmite etiquetas locales', () => {
  const api = service();
  const report = { tecnico_id: 1, turno_id: 1, area_id: 1, tipo_trabajo: 'preventivo', descripcion: 'Prueba',
    piezas: [{ partId: 1, qty: 2, name: 'local label' }], nombre_area: 'local area' };
  const a = api.reportPayload(report, '2026-10-06T12:00:00Z');
  assert.equal(JSON.stringify(a), JSON.stringify(api.reportPayload(report, '2026-10-06T12:00:00Z')));
  assert.equal(a.fecha_registro, '2026-10-06T12:00:00Z');
  assert.equal(a.tipo_trabajo, 'Preventivo');
  assert.equal(api.reportPayload({ ...report, tipo_trabajo: 'correctivo' }, '2026-10-06T12:00:00Z').tipo_trabajo, 'Correctivo');
  assert.equal(a.piezas[0].name, undefined);
  assert.throws(() => api.reportPayload(report), /fecha/);
});
test('errores de permisos pausan sincronización; stock conserva 409', async () => {
  const api = service();
  await assert.rejects(api.cloudResult(Promise.resolve({ error: { message: 'denied' }, status: 403 })), e => e.status === 401);
  assert.equal(api.signedOut(), true);
  await assert.rejects(service().cloudResult(Promise.resolve({ error: { message: 'stock' }, status: 409 })), e => e.status === 409);
});
test('almacenamiento offline separa backend, proyecto y dispositivo', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/backendConfig.js'), 'utf8').replace(/export /g, '');
  function database(backend, id) {
    const c = vm.createContext({ process: { env: { EXPO_PUBLIC_BACKEND: backend,
      EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      EXPO_PUBLIC_SUPABASE_DEVICE_ID: id } } });
    vm.runInContext(source + '\nglobalThis.file = OFFLINE_DATABASE', c);
    return c.file;
  }
  const id = '00000000-0000-0000-0000-000000000001';
  assert.equal(database('local', id), 'campoterra-offline.db');
  assert.notEqual(database('supabase', id), database('local', id));
  assert.notEqual(database('supabase', id), database('supabase', id.replace(/1$/, '2')));
});
