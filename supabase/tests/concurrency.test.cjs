// PostgreSQL real, aislado, sin puertos ni conexion al proyecto alojado.
// Ejecutar: node --test supabase/tests/concurrency.test.cjs (Docker abierto).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function docker(args, input = '') {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', args, { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err || out)));
    p.stdin.on('error', () => {}); p.stdin.end(input);
  });
}
test('conexiones independientes: ultima pieza, replay concurrente y revocacion', { timeout: 180000 }, async () => {
  const name = `campoterra-test-${randomUUID()}`;
  let created = false;
  const sql = query => docker(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'], query);
  const tablet = '00000000-0000-0000-0000-000000000001';
  const boss = '00000000-0000-0000-0000-000000000002';
  const payload = JSON.stringify({ tecnico_id: 1, turno_id: 1, area_id: 1,
    tipo_trabajo: 'Preventivo', descripcion: 'Prueba concurrente', fecha_registro: '2026-10-13T12:00:00Z', piezas: [{partId:1,qty:1}] });
  const call = key => `select public.registrar_reporte('${key}','${payload}'::jsonb);`;
  const auth = user => `set local role authenticated; set local "request.jwt.claim.sub"='${user}';`;
  // Mantener la primera transaccion abierta hasta observar bloqueo real de la segunda.
  async function race(key1, key2) {
    const marker = randomUUID();
    const first = sql(`begin; set application_name='${marker}'; ${auth(tablet)} ${call(key1)} select pg_sleep(3); commit;`);
    first.catch(() => {});
    let sleeping = false;
    for (let i=0;i<100;i++) {
      if (await sql(`select count(*) from pg_stat_activity where application_name='${marker}' and wait_event='PgSleep';`) === '1') { sleeping = true; break; }
      await delay(20);
    }
    assert.ok(sleeping, 'La primera transaccion mantiene el bloqueo');
    const secondMarker = randomUUID();
    const second = sql(`begin; set application_name='${secondMarker}'; ${auth(tablet)} ${call(key2)} commit;`);
    second.catch(() => {});
    let blocked = false;
    for (let i=0;i<40;i++) {
      if (await sql(`select count(*) from pg_stat_activity where application_name='${secondMarker}' and wait_event_type='Lock';`) === '1') { blocked = true; break; }
      await delay(20);
    }
    const outcomes = await Promise.allSettled([first,second]);
    assert.ok(blocked, 'La segunda conexion realmente espera un bloqueo');
    return outcomes;
  }
  try {
    await docker(['run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17']); created = true;
    let ready = false;
    for (let i=0;i<60;i++) { try { await sql('select 1;'); ready=true; break; } catch { await delay(500); } }
    assert.ok(ready, 'PostgreSQL iniciado');
    await sql(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values('${tablet}'),('${boss}');`);
    const dir = path.join(__dirname,'../migrations');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await sql(fs.readFileSync(path.join(dir,f),'utf8'));
    await sql(`insert into campoterra_private.accesos(auth_user_id,tipo,nombre) values('${tablet}','dispositivo','Tablet'),('${boss}','encargado','Encargado');
      insert into public.tecnicos(nombre) values('Prueba');
      insert into public.turnos(descripcion,hora_inicio,hora_fin) values('Turno','08:00','16:00');
      insert into public.areas_mantenimiento(nombre) values('Prueba');
      insert into public.piezas(nombre,codigo,stock) values('Ultima pieza','TEST',1);`);
    const outcomes = await race(randomUUID(),randomUUID());
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/Stock insuficiente/);
    assert.equal(await sql('select stock from public.piezas;'),'0');
    assert.equal(await sql('select count(*) from public.bitacoras;'),'1');
    assert.equal(await sql('select count(*) from public.movimientos_piezas;'),'1');
    await sql('update public.piezas set stock=1;');
    const key = randomUUID(); const repeated = await race(key,key);
    assert.ok(repeated.every(r=>r.status==='fulfilled'));
    const results = repeated.map(r=>JSON.parse(r.value));
    assert.equal(results[0].folio_bitacora,results[1].folio_bitacora);
    assert.equal(results[1].idempotent_replay,true);
    assert.equal(await sql('select stock from public.piezas;'),'0');
    for (const table of ['public.bitacoras','public.movimientos_piezas','public.notificaciones','campoterra_private.reportes_idempotencia']) {
      assert.equal(await sql(`select count(*) from ${table};`),'2');
    }
    await assert.rejects(sql(`begin; ${auth(tablet)} select public.crear_refaccion('No','NO','General'); commit;`),/exclusivo/);
    await assert.rejects(sql(`begin; ${auth(tablet)} update public.piezas set stock=99; commit;`),/permission denied/);
    await sql(`update campoterra_private.accesos set activo=false where auth_user_id='${tablet}';`);
    await assert.rejects(sql(`begin; ${auth(tablet)} ${call(key)} commit;`),/desactivado/);
    assert.equal(await sql(`begin; ${auth(tablet)} select count(*) from public.piezas; commit;`),'0');
  } finally { if (created) await docker(['rm','-f','-v',name]); }
});
