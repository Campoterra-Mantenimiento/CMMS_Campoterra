import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { submitNewReport, getMobileTechnicianId } from './api';
import { OFFLINE_DATABASE } from './backendConfig';

const database = SQLite.openDatabaseSync(OFFLINE_DATABASE);
let initialized = false;
let syncing = false;
const reportListeners = new Set();

const notifyReportsChanged = () => {
  reportListeners.forEach((listener) => {
    try { listener(); } catch (error) { console.warn('No se pudo actualizar el historial', error); }
  });
};

export const subscribeToReportChanges = (listener) => {
  reportListeners.add(listener);
  return () => reportListeners.delete(listener);
};

const ensureDatabase = () => {
  if (initialized) return;
  database.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pending_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS report_drafts (
      technician TEXT NOT NULL, shift TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (technician, shift)
    );
    CREATE TABLE IF NOT EXISTS catalog_cache (
      name TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const columns = database.getAllSync('PRAGMA table_info(pending_reports)');
  if (!columns.some((column) => column.name === 'error_kind')) {
    database.execSync('ALTER TABLE pending_reports ADD COLUMN error_kind TEXT');
  }
  // Se ejecuta una vez al abrir la app, nunca durante un envío en curso.
  database.execSync(`UPDATE pending_reports SET
    status = CASE WHEN attempts >= 5 THEN 'error' ELSE 'pending' END,
    error_kind = 'interrupted', last_error = 'El envío se interrumpió. Puedes reintentarlo.'
    WHERE status = 'syncing'`);
  initialized = true;
};

const now = () => new Date().toISOString();

export const cacheCatalog = (name, payload) => {
  ensureDatabase();
  database.runSync(
    `INSERT OR REPLACE INTO catalog_cache (name, payload, updated_at) VALUES (?, ?, ?)`,
    name,
    JSON.stringify(payload),
    now()
  );
};

export const getCachedCatalog = (name) => {
  ensureDatabase();
  const row = database.getFirstSync(
    'SELECT payload FROM catalog_cache WHERE name = ?',
    name
  );
  return row ? JSON.parse(row.payload) : null;
};

export const getReportDraft = (technician, shift) => {
  if (!technician || !shift) return null;
  ensureDatabase();
  const row = database.getFirstSync('SELECT payload FROM report_drafts WHERE technician = ? AND shift = ?', String(technician), String(shift));
  return row ? JSON.parse(row.payload) : null;
};
export const saveReportDraft = (technician, shift, draft) => {
  if (!technician || !shift) throw new Error('Selecciona técnico y turno para conservar el borrador.');
  ensureDatabase();
  database.runSync('INSERT OR REPLACE INTO report_drafts (technician, shift, payload) VALUES (?, ?, ?)', String(technician), String(shift), JSON.stringify(draft));
};
export const deleteReportDraft = (technician, shift) => {
  ensureDatabase();
  database.runSync('DELETE FROM report_drafts WHERE technician = ? AND shift = ?', String(technician), String(shift));
};

export const queueReport = (payload, consumeDraft = false) => {
  ensureDatabase();
  const idempotencyKey = Crypto.randomUUID();
  const timestamp = now();
  let result;
  const insertReport = () => {
  result = database.runSync(
    `INSERT INTO pending_reports
      (idempotency_key, payload, status, attempts, created_at, updated_at)
     VALUES (?, ?, 'pending', 0, ?, ?)`,
    idempotencyKey,
    JSON.stringify(payload),
    timestamp,
    timestamp
  );
  if (consumeDraft) deleteReportDraft(payload.tecnico_id, payload.turno_id);
  };
  if (consumeDraft) database.withTransactionSync(insertReport);
  else insertReport();
  notifyReportsChanged();
  return { id: result.lastInsertRowId, idempotencyKey };
};

// Fallar cerrado si no hay técnico: nunca mostrar el historial de otra sesión.
export const getReportsForTechnician = (technicianId) => {
  if (!technicianId) return [];
  ensureDatabase();
  return database.getAllSync(
    'SELECT id, payload, status, attempts, last_error, error_kind, created_at, updated_at FROM pending_reports ORDER BY created_at DESC, id DESC'
  ).flatMap((row) => {
    try {
      const payload = JSON.parse(row.payload);
      if (!payload || String(payload.tecnico_id) !== String(technicianId)) return [];
      return [{ ...row, payload }];
    } catch {
      return [];
    }
  });
};

export const getPendingReportSummary = () => {
  const reports = getReportsForTechnician(getMobileTechnicianId());
  return reports.reduce((summary, report) => {
    if (['pending', 'syncing'].includes(report.status)) summary.pending += 1;
    if (report.status === 'error') summary.errors += 1;
    return summary;
  }, { pending: 0, errors: 0 });
};

export const getReportStatus = (id) => {
  ensureDatabase();
  return database.getFirstSync(
    'SELECT status, last_error FROM pending_reports WHERE id = ?',
    id
  );
};

const markReport = (id, status, error = null, kind = null) => {
  database.runSync(
    'UPDATE pending_reports SET status = ?, last_error = ?, error_kind = ?, updated_at = ? WHERE id = ?',
    status,
    error,
    kind,
    now(),
    id
  );
  notifyReportsChanged();
};

const classifyError = (error) => {
  const detail = error?.message || 'No se pudo enviar el reporte.';
  if (error?.status === 401) return { kind: 'auth', message: 'Tu sesión venció. Inicia la jornada de nuevo para enviar este reporte.' };
  if (error?.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
    return { kind: 'review', message: `${detail} Revisa el problema con el encargado antes de reintentar.` };
  }
  return { kind: 'temporary', message: error?.status
    ? `El servidor no pudo procesar el envío. ${detail}`
    : 'No se pudo conectar con el servidor o el envío tardó demasiado. Verifica la conexión y reintenta.' };
};

// El bloqueo se toma antes de cualquier await; todos los disparadores lo comparten.
const runSync = async (retryId = null, technicianId = null) => {
  ensureDatabase();
  if (syncing) {
    if (retryId !== null) throw new Error('Hay un envío en curso. Espera un momento y vuelve a intentar.');
    return getPendingReportSummary();
  }
  const owner = getMobileTechnicianId();
  if (!owner) {
    if (retryId !== null) throw new Error('Inicia la jornada nuevamente para reintentar.');
    return getPendingReportSummary();
  }
  if (retryId !== null && String(owner) !== String(technicianId)) {
    throw new Error('La jornada activa no corresponde a este técnico.');
  }
  syncing = true;
  try {
    const network = await NetInfo.fetch();
    if (!network.isConnected || network.isInternetReachable === false) {
      if (retryId !== null) throw new Error('No hay conexión. El reporte sigue guardado; reintenta cuando vuelva la red.');
      return getPendingReportSummary();
    }
    // No reiniciar intentos si la sesión cambió mientras se comprobaba la red.
    if (String(getMobileTechnicianId()) !== String(owner)) return getPendingReportSummary();
    if (retryId !== null) {
      const report = database.getFirstSync('SELECT * FROM pending_reports WHERE id = ?', retryId);
      if (!report || String(JSON.parse(report.payload).tecnico_id) !== String(owner)) {
        throw new Error('No se encontró este reporte en tu historial.');
      }
      if (report.status === 'synced') return getPendingReportSummary();
      database.runSync('UPDATE pending_reports SET attempts = 0 WHERE id = ?', retryId);
      markReport(retryId, 'pending');
    }
    // Filtrar los agotados ANTES de seleccionar. Cada captura se intenta una vez por pasada.
    const reports = database.getAllSync(`SELECT id, idempotency_key, payload, attempts, created_at
      FROM pending_reports WHERE status IN ('pending', 'error') AND attempts < 5
      AND (error_kind IS NULL OR error_kind != 'review') ORDER BY created_at ASC, id ASC`);
    for (const report of reports) {
      if (String(getMobileTechnicianId()) !== String(owner)) break;
      if (retryId !== null && report.id !== retryId) continue;
      let payload;
      try { payload = JSON.parse(report.payload); } catch { continue; }
      if (!payload || String(payload.tecnico_id) !== String(owner)) continue;
      database.runSync('UPDATE pending_reports SET attempts = attempts + 1 WHERE id = ?', report.id);
      markReport(report.id, 'syncing');
      try {
        await submitNewReport(payload, report.idempotency_key, report.created_at);
        markReport(report.id, 'synced');
      } catch (error) {
        const failure = classifyError(error);
        if (failure.kind === 'auth') {
          database.runSync('UPDATE pending_reports SET attempts = MAX(attempts - 1, 0) WHERE id = ?', report.id);
        }
        markReport(report.id, 'error', failure.message, failure.kind);
        if (failure.kind === 'auth') break;
      }
    }
  } finally {
    syncing = false;
  }
  return getPendingReportSummary();
};

export const syncPendingReports = () => runSync();
export const retryReport = (id, technicianId) => runSync(id, technicianId);

export const subscribeToSync = (onChange) => {
  ensureDatabase();
  const changed = () => onChange(getPendingReportSummary());
  const stopReports = subscribeToReportChanges(changed);
  const stopNetwork = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      syncPendingReports().catch((error) => console.warn('No se pudo sincronizar', error)).finally(changed);
    } else changed();
  });
  return () => { stopReports(); stopNetwork(); };
};
