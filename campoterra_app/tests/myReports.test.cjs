const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function service(rows = []) {
  const db = {
    execSync() {},
    getAllSync() { return rows; },
    getFirstSync() { return { pending: 0, errors: 0 }; },
    runSync() { return { lastInsertRowId: 10 }; },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/offlineSync.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export const /g, 'const ');
  const context = vm.createContext({
    OFFLINE_DATABASE: 'test.db', SQLite: { openDatabaseSync: () => db }, Crypto: { randomUUID: () => 'test-key' },
    NetInfo: { fetch: async () => ({ isConnected: true }) },
    submitNewReport: async () => ({}), getMobileTechnicianId: () => 7, console,
  });
  vm.runInContext(source + '\nglobalThis.api = { getReportsForTechnician, subscribeToReportChanges, queueReport, syncPendingReports };', context);
  return { api: context.api, db };
}

test('historial filtra por técnico, acepta IDs numéricos/texto y excluye datos inválidos', () => {
  const rows = [
    { id: 3, status: 'synced', payload: '{"tecnico_id":7}' },
    { id: 2, status: 'error', payload: '{"tecnico_id":8}' },
    { id: 1, status: 'pending', payload: '{"tecnico_id":"7"}' },
    { id: 4, payload: 'invalid' }, { id: 5, payload: 'null' },
  ];
  const { api } = service(rows);
  assert.equal(JSON.stringify(api.getReportsForTechnician(7).map(r => r.id)), '[3,1]');
  assert.equal(api.getReportsForTechnician(null).length, 0);
  assert.equal(api.getReportsForTechnician(undefined).length, 0);
  assert.equal(api.getReportsForTechnician(9).length, 0);
});

test('consulta ordena capturas recientes primero y no escribe reportes', () => {
  const { api, db } = service();
  db.getAllSync = (sql) => {
    if (sql.startsWith('PRAGMA')) return [{ name: 'error_kind' }];
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    return [];
  };
  db.runSync = () => { throw new Error('No debe escribir'); };
  assert.equal(api.getReportsForTechnician(7).length, 0);
});

test('guardado y sincronización notifican al historial; desuscribirse detiene eventos', async () => {
  const { api } = service([{ id: 1, attempts: 0, payload: '{"tecnico_id":7}', idempotency_key: 'key' }]);
  let events = 0;
  const unsubscribe = api.subscribeToReportChanges(() => events++);
  api.queueReport({ tecnico_id: 7 });
  assert.equal(events, 1);
  await api.syncPendingReports();
  assert.equal(events, 3); // syncing y synced
  unsubscribe();
  api.queueReport({ tecnico_id: 7 });
  assert.equal(events, 3);
});
