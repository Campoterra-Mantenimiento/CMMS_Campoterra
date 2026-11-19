const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('report RPC: authorization, atomic rollback, inventory and idempotency', async () => {
  const db = new PGlite();
  const tablet = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  const boss = '00000000-0000-0000-0000-000000000003';
  const key = '10000000-0000-0000-0000-000000000001';
  const key2 = '10000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${tablet}'),('${other}'),('${boss}');`);
    for (const name of ['202610060001_pilot_base.sql', '202610060002_reportes.sql', '202610060003_acceso_dispositivo.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8'));
    }
    await db.exec(`insert into campoterra_private.accesos(auth_user_id,tipo,nombre) values
      ('${tablet}','dispositivo','Tablet'),('${other}','dispositivo','Otra'),('${boss}','encargado','Jefe');
      insert into public.tecnicos(nombre) values ('Técnico');
      insert into public.turnos(descripcion,hora_inicio,hora_fin) values ('Turno','08:00','16:00');
      insert into public.areas_mantenimiento(nombre) values ('Área');
      insert into public.piezas(nombre,codigo,stock) values ('Pieza A','A',10),('Pieza B','B',1);`);
    const payload = { tecnico_id: 1, turno_id: 1, area_id: 1, equipo_id: null,
      tipo_trabajo: 'Preventivo', descripcion: 'Prueba', fecha_registro: '2026-10-06T12:00:00Z',
      piezas: [{ partId: 1, qty: 2 }, { partId: 1, qty: 1 }] };
    async function send(user, k, report, role = 'authenticated') {
      await db.exec(`begin; set local role ${role};`);
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        const result = await db.query('select public.registrar_reporte($1::uuid,$2::jsonb) as result', [k, JSON.stringify(report)]);
        await db.exec('commit');
        return result.rows[0].result;
      } catch (error) { await db.exec('rollback'); throw error; }
    }
    const scalar = async (sql) => (await db.query(sql)).rows[0].n;
    await assert.rejects(send(tablet, key, payload, 'anon'), /permission denied/);
    await assert.rejects(send(boss, key, payload), /no autorizado/);
    await assert.rejects(send('', key, payload), /no autorizado/);
    const first = await send(tablet, key, payload);
    assert.equal(first.idempotent_replay, false);
    assert.equal(await scalar('select stock as n from public.piezas where id_pieza=1'), 7);
    assert.equal(await scalar('select count(*)::int as n from public.movimientos_piezas'), 1);
    const replay = await send(tablet, key, payload);
    assert.equal(replay.idempotent_replay, true);
    assert.equal(replay.folio_bitacora, first.folio_bitacora);
    assert.equal(await scalar('select count(*)::int as n from public.notificaciones'), 1);
    await assert.rejects(send(other, key, payload), /otro reporte/);
    await assert.rejects(send(tablet, key, { ...payload, descripcion: 'Cambio' }), /otro reporte/);
    // Failure after updating first piece must roll back that update and the report.
    await assert.rejects(send(tablet, key2, { ...payload, piezas: [{ partId: 1, qty: 2 }, { partId: 2, qty: 2 }] }), /Stock insuficiente/);
    assert.equal(await scalar('select stock as n from public.piezas where id_pieza=1'), 7);
    assert.equal(await scalar('select count(*)::int as n from public.bitacoras'), 1);
    assert.equal(await scalar('select count(*)::int as n from campoterra_private.reportes_idempotencia'), 1);
    for (const bad of [0, -1, 1.5, null]) {
      await assert.rejects(send(tablet, key2, { ...payload, piezas: [{ partId: 1, qty: bad }] }), /enteros positivos/);
    }
    await assert.rejects(send(tablet, key2, { ...payload, tecnico_id: 99 }), /Técnico no activo/);
    await assert.rejects(send(tablet, key2, { ...payload, fecha_registro: 'invalid' }), /fecha inválidos/);
    await assert.rejects(send(tablet, null, payload), /obligatorios/);
    await assert.rejects(send(tablet, key2, { ...payload, piezas: null }), /inválidos/);
    await send(tablet, key2, { ...payload, piezas: [] });
    assert.equal(await scalar('select count(*)::int as n from public.bitacoras'), 2);
    await db.exec('update public.tecnicos set estado=\'Inactivo\'');
    assert.equal((await send(tablet, key, payload)).idempotent_replay, true);
    await db.exec(`update campoterra_private.accesos set activo=false where auth_user_id='${tablet}'`);
    await assert.rejects(send(tablet, key, payload), /desactivado/);
  } finally { await db.close(); }
});
