const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(file, name) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = text.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
    }
    throw Error('Función incompleta: ' + name);
}

for (const file of ['reportes.html', 'bitacoras.html']) {
    test(file + ': la semana incluye ambos años y excluye el domingo siguiente', () => {
        const context = vm.createContext({
            document: { getElementById: id => ({ value: id === 'filtroTipo' ? 'Todos' : '' }) },
            criterio: { modo: 'semana', anio: 2027, semana: 1 },
            bitacorasGlobal: ['2026-12-26T23:59:59', '2026-12-27T00:00:00', '2026-12-31T23:59:59',
                '2027-01-01T00:00:00', '2027-01-02T23:59:59', '2027-01-03T00:00:00']
                .map((fecha_registro, id_bitacora) => ({ fecha_registro, id_bitacora })),
            obtenerCriterioFiltro() { return this.criterio; },
            actualizarRango() {}, renderizarTabla() {}, renderizarBitacoras() {}
        });
        vm.runInContext('function obtenerCriterioFiltro() { return criterio; }', context);
        for (const name of ['obtenerFecha', 'inicioSemanaUno', 'obtenerRangoSemana', 'aplicarFiltros'])
            vm.runInContext(source(file, name), context);
        vm.runInContext('aplicarFiltros()', context);
        assert.deepEqual(Array.from(context.bitacorasFiltradas, r => r.id_bitacora), [1, 2, 3, 4]);
        context.criterio = { modo: 'anio', anio: 2027 };
        vm.runInContext('aplicarFiltros()', context);
        assert.deepEqual(Array.from(context.bitacorasFiltradas, r => r.id_bitacora), [3, 4, 5]);
    });
}

test('la búsqueda del panel se puede reaplicar después de refrescar las filas', () => {
    const rows = [{ textContent: 'Marco: bomba', style: {} }, { textContent: 'Ramón: motor', style: {} }];
    const input = { value: '  MARCO  ' };
    const context = vm.createContext({ document: { getElementById: () => input, querySelectorAll: () => rows } });
    vm.runInContext(source('dashboard.html', 'aplicarBusquedaDashboard'), context);
    vm.runInContext('aplicarBusquedaDashboard()', context);
    assert.equal(rows[0].style.display, '');
    assert.equal(rows[1].style.display, 'none');
    rows.push({ textContent: 'Lencho: banda', style: {} });
    vm.runInContext('aplicarBusquedaDashboard()', context);
    assert.equal(rows[2].style.display, 'none');
    input.value = '';
    vm.runInContext('aplicarBusquedaDashboard()', context);
    assert.ok(rows.every(r => r.style.display === ''));
});

test('ambas descargas de evaluaciones se bloquean al cargar y se recuperan tras un error de guardado', () => {
    const elements = { 'eval-export': {}, 'eval-export-pdf': {} };
    const context = vm.createContext({ $: id => elements[id], busy: true, loadedDate: '2026-11-03',
        week: () => ({}), weekRows: () => [{ resultado: 80 }] });
    vm.runInContext(source('evaluaciones.js', 'actualizarExportaciones'), context);
    vm.runInContext('actualizarExportaciones()', context);
    assert.ok(Object.values(elements).every(e => e.disabled));
    context.busy = false;
    vm.runInContext('actualizarExportaciones()', context);
    assert.ok(Object.values(elements).every(e => !e.disabled));
    context.loadedDate = '';
    vm.runInContext('actualizarExportaciones()', context);
    assert.ok(Object.values(elements).every(e => e.disabled));
});
