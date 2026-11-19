const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../auth.js'), 'utf8');

async function navigate(page, status) {
    const redirects = [];
    let checks = 0;
    const location = { pathname: '/CMSS_Campoterra/' + page, replace: target => redirects.push(target) };
    vm.runInNewContext(source, {
        location,
        window: { location, CampoterraCloud: { enabled: true, requireSession: async () => {
            checks++;
            if (status) throw { status };
        } } },
        document: { addEventListener() {} },
    });
    await Promise.resolve();
    return { redirects, checks };
}

test('Evaluaciones permanece abierta y comprueba la sesión del encargado', async () => {
    assert.deepEqual(await navigate('evaluaciones.html'), { redirects: [], checks: 1 });
});
test('Evaluaciones sin sesión o sin permiso regresa al login', async () => {
    for (const status of [401, 403]) assert.deepEqual((await navigate('evaluaciones.html', status)).redirects, ['login.html']);
});
test('las páginas desconocidas siguen regresando al panel', async () => {
    assert.deepEqual((await navigate('desconocida.html')).redirects, ['dashboard.html']);
});
