const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const sql = new DatabaseSync(':memory:');
  const state = { owner: 7, connected: true, sends: [], failure: null };
  const db = {
    withTransactionSync: (fn) => { sql.exec('BEGIN'); try { fn(); sql.exec('COMMIT'); } catch (error) { sql.exec('ROLLBACK'); throw error; } },
    execSync: (query) => sql.exec(query),
    getAllSync: (query, ...args) => sql.prepare(query).all(...args),
    getFirstSync: (query, ...args) => sql.prepare(query).get(...args),
    runSync: (query, ...args) => {
      const result = sql.prepare(query).run(...args);
      return { ...result, lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/offlineSync.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export const /g, 'const ');
  function load() {
    const context = vm.createContext({
      OFFLINE_DATABASE: 'test.db', SQLite: { openDatabaseSync: () => db }, Crypto: { randomUUID }, console,
      getMobileTechnicianId: () => state.owner,
      NetInfo: { fetch: async () => ({ isConnected: state.connected }) },
      submitNewReport: async (payload, key, capturedAt) => {
        state.sends.push({ payload, key, capturedAt });
        if (state.send) await state.send();
        if (state.failure) throw state.failure;
        return {};
      },
    });
    vm.runInContext(source + '\nglobalThis.api = {queueReport, syncPendingReports, retryReport, getReportsForTechnician, getReportDraft, saveReportDraft, deleteReportDraft};', context);
    return context.api;
  }
  const api = load();
  const add = (owner = 7) => api.queueReport({ tecnico_id: owner, area_id: 1, piezas: [] }).id;
  const row = (id) => db.getFirstSync('SELECT * FROM pending_reports WHERE id = ?', id);
  return { api, add, row, db, state, load };
}

test('agotados no bloquean los siguientes; procesa más de diez y solo al técnico activo', async () => {
  const { api, add, db, row, state } = setup();
  for (let i = 0; i < 10; i++) db.runSync("UPDATE pending_reports SET attempts=5, status='error' WHERE id=?", add());
  const other = add(8);
  const ready = Array.from({ length: 12 }, () => add());
  await api.syncPendingReports();
  assert.equal(state.sends.length, 12);
  ready.forEach(id => assert.equal(row(id).status, 'synced'));
  assert.equal(row(other).attempts, 0);
});

test('reintento manual conserva payload y clave, reinicia agotados y no reenvía confirmados', async () => {
  const { api, add, row, db, state } = setup();
  const id = add(); const before = row(id);
  db.runSync("UPDATE pending_reports SET status='error', attempts=5, error_kind='review' WHERE id=?", id);
  await api.retryReport(id, 7);
  assert.equal(row(id).status, 'synced');
  assert.equal(row(id).attempts, 1);
  assert.equal(state.sends[0].key, before.idempotency_key);
  assert.equal(state.sends[0].capturedAt, before.created_at);
  assert.equal(JSON.stringify(state.sends[0].payload), before.payload);
  await api.retryReport(id, 7);
  assert.equal(state.sends.length, 1);
});

test('red caída y sesión ausente no gastan intentos; técnico ajeno no puede reintentar', async () => {
  const { api, add, row, state } = setup(); const id = add();
  state.connected = false;
  await api.syncPendingReports();
  await assert.rejects(api.retryReport(id, 7), /No hay conexión/);
  state.connected = true; state.owner = null;
  await api.syncPendingReports();
  state.owner = 8;
  await assert.rejects(api.retryReport(id, 8), /tu historial/);
  assert.equal(row(id).attempts, 0);
  assert.equal(state.sends.length, 0);
});

test('arranque recupera syncing incluso después del quinto intento sin perder captura', () => {
  const { add, row, db, load } = setup(); const id = add(); const exhausted = add();
  db.runSync("UPDATE pending_reports SET status='syncing', attempts=2 WHERE id=?", id);
  db.runSync("UPDATE pending_reports SET status='syncing', attempts=5 WHERE id=?", exhausted);
  const before = row(id);
  load().getReportsForTechnician(7);
  assert.equal(row(id).status, 'pending');
  assert.equal(row(exhausted).status, 'error');
  assert.equal(row(id).payload, before.payload);
  assert.equal(row(id).idempotency_key, before.idempotency_key);
});

test('rechazo de inventario conserva detalle y no se reintenta automáticamente', async () => {
  const { api, add, row, state } = setup(); const id = add();
  state.failure = Object.assign(new Error('Pieza 12: Disponible: 0; solicitado: 2.'), { status: 409 });
  await api.syncPendingReports(); await api.syncPendingReports();
  assert.equal(state.sends.length, 1);
  assert.equal(row(id).error_kind, 'review');
  assert.match(row(id).last_error, /Pieza 12/);
});

test('401 pausa el lote y no consume intentos; servidor caído queda reintentable', async () => {
  const { api, add, row, state } = setup(); const id = add(); const next = add();
  state.failure = Object.assign(new Error('Sesión expirada'), { status: 401 });
  await api.syncPendingReports();
  assert.equal(row(id).error_kind, 'auth'); assert.equal(row(id).attempts, 0);
  assert.equal(row(next).attempts, 0);
  state.failure = Object.assign(new Error('Servidor caído'), { status: 503 });
  await api.syncPendingReports();
  assert.equal(row(id).error_kind, 'temporary'); assert.equal(row(id).attempts, 1);
});

test('dos disparadores simultáneos solo envían una vez', async () => {
  const { api, add, state } = setup(); add();
  await Promise.all([api.syncPendingReports(), api.syncPendingReports()]);
  assert.equal(state.sends.length, 1);
});

test('borrador persiste, se aísla por técnico y turno y se consume al guardar', () => {
  const { api, load, db } = setup();
  api.saveReportDraft(7, 1, { description: 'Revisión', cart: [{ id: 1, quantity: 2 }] });
  assert.equal(load().getReportDraft(7, 1).description, 'Revisión');
  assert.equal(api.getReportDraft(8, 1), null);
  assert.equal(api.getReportDraft(7, 2), null);
  db.execSync("CREATE TRIGGER fail_report BEFORE INSERT ON pending_reports BEGIN SELECT RAISE(ABORT, 'fallo'); END;");
  assert.throws(() => api.queueReport({ tecnico_id: 7, turno_id: 1 }, true));
  assert.equal(api.getReportDraft(7, 1).description, 'Revisión');
  db.execSync('DROP TRIGGER fail_report');
  api.queueReport({ tecnico_id: 7, turno_id: 1 }, true);
  assert.equal(api.getReportDraft(7, 1), null);
});
