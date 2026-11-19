const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

function setup(role = 'encargado') {
    const store = () => { const map = new Map(); return { getItem: k => map.get(k) || null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) }; };
    const state = { calls: [], rpcCalls: [], signedOut: false, failEntry: false };
    const client = {
        auth: {
            getSession: async () => ({ data: { session: { user: { id: 'test' } } } }),
            signInWithPassword: async () => ({}),
            signOut: async () => { state.signedOut = true; },
        },
        rpc: async (name, args) => {
            state.rpcCalls.push({ name, args });
            if (role !== 'encargado') return { error: { message: 'Acceso exclusivo del encargado activo' }, status: 403 };
            if (name === 'registrar_entrada' && state.failEntry) return { error: { message: 'Sin conexión' }, status: 503 };
            return { data: { username: 'boss', nombre: 'Encargado', rol: 'Administrador' } };
        },
        from: table => {
            const query = { select: () => query, order: () => query,
                gte: (column,value) => { state.calls.push({gte:column,value}); return query; },
                lte: (column,value) => { state.calls.push({lte:column,value}); return query; }, range: async (start, end) => {
                state.calls.push({ table, start, end });
                const rows = Array.from({ length: 501 }, (_, i) => table === 'bitacoras'
                    ? { id_bitacora: i+1, fecha_registro: '2026-10-08T17:00:00Z', tipo_mantenimiento: 'Preventivo', equipo: { nombre: '<img onerror=bad>' }, area: { nombre: 'Área' }, tecnico: { nombre: 'Técnico' }, turno: { descripcion: 'Turno' } }
                    : { id_pieza: i+1, nombre: 'Pieza', stock: 8 });
                return { data: rows.slice(start, end+1) };
            } };
            return query;
        },
    };
    const context = vm.createContext({ window: { CAMPOTERRA_CONFIG: { backend: 'supabase', supabaseUrl: 'https://test.supabase.co', publishableKey: 'public' },
        supabase: { createClient: () => client } }, localStorage: store(), sessionStorage: store(), Response, URL, crypto: { randomUUID },
        location: { href: 'http://localhost:5500/dashboard.html', replace: value => { state.redirect = value; } } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../cloud.js'), 'utf8'), context);
    return { api: context.window.CampoterraCloud, escape: context.window.escapeHtml, state };
}
test('pagina todas las filas y adapta relaciones sin alterar texto de datos', async () => {
    const { api, state } = setup();
    const response = await api.request('http://localhost:8000/api/bitacoras/');
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.equal(rows.length, 501);
    assert.equal(rows[0].nombre_equipo, '<img onerror=bad>');
    assert.equal(state.calls.length, 2);
});
test('tablet no inicia sesión administrativa ni obtiene consultas', async () => {
    const { api, state } = setup('dispositivo');
    await assert.rejects(api.login('device@example.test', 'test', false), /exclusivo/);
    assert.equal(state.signedOut, true);
    assert.equal((await api.request('/api/piezas/')).status, 403);
    assert.equal(state.calls.length, 0);
    assert.equal(state.redirect, 'login.html');
});
test('escrituras no habilitadas y rutas desconocidas fallan sin consultar otro backend', async () => {
    const { api, state } = setup();
    assert.equal((await api.request('/api/mi-perfil', { method: 'PUT' })).status, 405);
    assert.equal((await api.request('/api/otra')).status, 404);
    assert.equal(state.calls.length, 0);
});
test('semana respeta domingo y fin exclusivo; texto se escapa para HTML', () => {
    const { api, escape } = setup();
    const data = api.weekly([{ fecha_registro: '2026-01-01T12:00:00', tipo_mantenimiento: 'Preventivo' },
        { fecha_registro: '2026-01-04T00:00:00', tipo_mantenimiento: 'Correctivo' }], 2026, 1);
    assert.equal(data.inicio, '2025-12-28'); assert.equal(data.fin, '2026-01-03');
    assert.equal(data.total, 1); assert.equal(data.preventivos, 1);
    assert.throws(() => api.weekly([], 2026, 99), /inválida/);
    assert.equal(escape('<img src="x" onerror=\'bad\'>'), '&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;');
});
test('scripts inline de todas las páginas mantienen sintaxis válida', () => {
    const root = path.join(__dirname, '..');
    for (const name of fs.readdirSync(root).filter(n => n.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(root, name), 'utf8');
        for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
            if (match[1].trim()) new vm.Script(match[1], { filename: name });
        }
        if (name === 'index.html') assert.ok(html.includes('url=login.html'), name);
        else assert.match(html, /src="cloud\.js(?:\?[^"\s]+)?"/, name);
    }
});

test('mapea cambios de catálogo y notificaciones a funciones autorizadas', async () => {
    const { api, state } = setup();
    assert.equal((await api.request('/api/areas/4/status?activa=false', { method: 'PATCH' })).status, 200);
    const change = state.rpcCalls.find(c => c.name === 'administrar_catalogo');
    assert.equal(change.args.p_catalogo, 'areas'); assert.equal(change.args.p_datos.activa, false);
    assert.equal((await api.request('/api/notificaciones/2/leer', { method: 'POST' })).status, 200);
    assert.equal(state.rpcCalls.find(c => c.name === 'leer_notificaciones').args.p_id, 2);
});
test('entrada conserva clave tras respuesta incierta y la renueva tras éxito', async () => {
    const { api, state } = setup();
    const options = { method: 'POST', body: JSON.stringify({ cantidad: 3, motivo: 'Prueba' }) };
    state.failEntry = true;
    assert.equal((await api.request('/api/piezas/1/entradas', options)).status, 503);
    state.failEntry = false;
    assert.equal((await api.request('/api/piezas/1/entradas', options)).status, 200);
    assert.equal((await api.request('/api/piezas/1/entradas', options)).status, 200);
    const keys = state.rpcCalls.filter(c => c.name === 'registrar_entrada').map(c => c.args.p_clave);
    assert.equal(keys[0], keys[1]); assert.notEqual(keys[1], keys[2]);
});

test('alta de refacción usa RPC exclusiva sin permitir stock arbitrario', async () => {
    const { api, state } = setup();
    const response = await api.request('/api/piezas/', { method: 'POST', body: JSON.stringify({ nombre: 'Rodamiento', codigo: 'R1', categoria: 'General', stock: 999 }) });
    assert.equal(response.status, 200);
    const call = state.rpcCalls.find(c => c.name === 'crear_refaccion');
    assert.equal(call.args.p_codigo, 'R1');
    assert.equal(call.args.p_nombre, 'Rodamiento');
    assert.equal(call.args.p_categoria, 'General');
    assert.equal(Object.keys(call.args).length, 3);
    assert.equal(state.calls.length, 0);
});
test('evaluaciones pagina el rango y envía notas y revisión a la función protegida', async () => {
 const {api,state}=setup();
 assert.equal((await api.request('/api/evaluaciones?desde=2026-10-18&hasta=2026-10-24')).status,200);
 assert.ok(state.calls.some(c=>c.gte==='fecha_trabajo'&&c.value==='2026-10-18'));
 assert.ok(state.calls.some(c=>c.lte==='fecha_trabajo'&&c.value==='2026-10-24'));
 assert.equal(state.calls.filter(c=>c.table==='evaluaciones').length,2);
 const response=await api.request('/api/evaluaciones',{method:'POST',body:JSON.stringify({id_tecnico:1,id_turno:2,fecha_trabajo:'2026-10-20',calidad:4,cumplimiento:3,orden:5,documentacion:4,observaciones:'Nota',revision:2})});
 assert.equal(response.status,200);
 const call=state.rpcCalls.find(c=>c.name==='guardar_evaluacion');
 assert.equal(call.args.p_revision,2);assert.equal(call.args.p_calidad,4);assert.equal(call.args.p_fecha,'2026-10-20');
 assert.equal((await api.request('/api/evaluaciones?desde=mal&hasta=mal')).status,422);
});

test('actividades consulta el rango completo y guarda mediante la función del encargado', async () => {
 const {api,state}=setup();
 const response=await api.request('/api/actividades?desde=2026-11-01&hasta=2026-11-07');
 assert.equal((await response.json()).length,501);
 assert.equal(state.calls.filter(c=>c.table==='actividades_mantenimiento').length,2);
 assert.ok(state.calls.some(c=>c.gte==='fecha_trabajo'&&c.value==='2026-11-01'));
 assert.equal((await api.request('/api/actividades?desde=2026-11-07&hasta=2026-11-01')).status,422);
 const body={id_actividad:'10000000-0000-0000-0000-000000000001',id_tecnico:1,fecha_trabajo:'2026-11-04',descripcion:'Revisar bomba',tipo:'Emergente',estado:'Realizada',observaciones:'Reparada',revision:1};
 assert.equal((await api.request('/api/actividades',{method:'POST',body:JSON.stringify(body)})).status,200);
 const args=state.rpcCalls.find(c=>c.name==='guardar_actividad').args;
 assert.equal(args.p_id,body.id_actividad);assert.equal(args.p_revision,1);assert.equal(args.p_estado,'Realizada');
 assert.equal(args.p_tipo,'Emergente');assert.equal(args.p_tecnico,1);
 assert.equal((await api.request('/api/actividades',{method:'DELETE'})).status,405);
 const device=setup('dispositivo');
 assert.equal((await device.api.request('/api/actividades?desde=2026-11-01&hasta=2026-11-07')).status,403);
});
