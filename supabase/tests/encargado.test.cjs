const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('perfil web solo autoriza al encargado activo', async () => {
  const db = new PGlite();
  const boss = '00000000-0000-0000-0000-000000000001';
  const device = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as
      $$ select '{"email":"encargado@example.test"}'::jsonb $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${boss}'),('${device}');`);
    for (const name of ['202610060001_pilot_base.sql', '202610080004_acceso_encargado.sql', '202610080005_administracion.sql', '202610080006_nuevas_refacciones.sql', '202610190007_minimos_refacciones.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8'));
    }
    await db.exec(`insert into campoterra_private.accesos(auth_user_id,tipo,nombre) values
      ('${boss}','encargado','Encargado'),('${device}','dispositivo','Tablet');`);
    async function profile(id, role = 'authenticated') {
      await db.exec(`begin; set local role ${role};`);
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
        return (await db.query('select public.acceso_encargado() as perfil')).rows[0].perfil;
      } finally { await db.exec('rollback'); }
    }
    assert.equal((await profile(boss)).rol, 'Administrador');
    async function rpc(user, sql, args = []) {
      await db.exec('begin; set local role authenticated');
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        const res = await db.query(sql, args);
        await db.exec('commit'); return res.rows[0]?.result;
      } catch (e) { await db.exec('rollback'); throw e; }
    }
    const catalog = (user, type, action, id, data) => rpc(user,
      'select public.administrar_catalogo($1,$2,$3,$4::jsonb) as result', [type, action, id, JSON.stringify(data)]);
    await assert.rejects(catalog(device, 'equipos', 'crear', null, { nombre: 'No', codigo_interno: 'NO' }), /exclusivo/);
    const machine = await catalog(boss, 'equipos', 'crear', null, { nombre: "Máquina O'Brien", codigo_interno: 'TEST' });
    assert.equal(machine.nombre, "Máquina O'Brien");
    assert.equal((await catalog(boss, 'equipos', 'editar', machine.id_equipo, { nombre: 'Editada', codigo_interno: 'TEST', estado: 'Inactivo' })).estado, 'Inactivo');
    await assert.rejects(catalog(boss, 'equipos', 'crear', null, { nombre: 'Duplicada', codigo_interno: 'TEST' }), /existe/);
    const tech = await catalog(boss, 'tecnicos', 'crear', null, { nombre: 'Técnico' });
    await catalog(boss, 'tecnicos', 'editar', tech.id_tecnico, { nombre: 'Otro', estado: 'Activo' });
    await catalog(boss, 'tecnicos', 'eliminar', tech.id_tecnico, {});
    const area = await catalog(boss, 'areas', 'crear', null, { nombre: 'Área' });
    await catalog(boss, 'areas', 'editar', area.id_area, { nombre: 'Nueva área' });
    assert.equal((await catalog(boss, 'areas', 'estado', area.id_area, { activa: false })).activa, false);
    await assert.rejects(catalog(boss, 'areas', 'editar', 9999, { nombre: 'No' }), /no encontrado/);
    await db.exec("insert into public.piezas(nombre,codigo,stock) values ('Pieza','P1',8)");
    const minimumSQL = 'select public.configurar_minimo_refaccion(1,$1) as result';
    await assert.rejects(rpc(device, minimumSQL, [5]), /exclusivo/);
    await assert.rejects(rpc(boss, minimumSQL, [-1]), /cero o mayor/);
    assert.equal((await rpc(boss, minimumSQL, [5])).stock_minimo, 5);
    assert.equal((await rpc(boss, minimumSQL, [0])).stock_minimo, 0);
    assert.equal((await rpc(boss, minimumSQL, [null])).stock_minimo, null);
    assert.equal((await db.query('select stock from public.piezas where id_pieza=1')).rows[0].stock, 8);
    await assert.rejects(rpc(boss, 'select public.configurar_minimo_refaccion(9999,1) as result'), /no existe/);
    const entrySQL = 'select public.registrar_entrada($1,1,$2,$3) as result';
    const key = '10000000-0000-0000-0000-000000000001';
    await assert.rejects(rpc(device, entrySQL, [key, 3, 'Prueba']), /exclusivo/);
    assert.equal((await rpc(boss, entrySQL, [key, 3, 'Prueba'])).stock, 11);
    assert.equal((await rpc(boss, entrySQL, [key, 3, 'Prueba'])).stock, 11);
    await assert.rejects(rpc(boss, entrySQL, [key, 4, 'Prueba']), /otra entrada/);
    assert.equal((await db.query('select count(*)::int as n from public.movimientos_piezas')).rows[0].n, 1);
    await db.exec("insert into public.notificaciones(titulo,mensaje) values ('Prueba','Mensaje')");
    await assert.rejects(rpc(device, 'select public.leer_notificaciones(null) as result'), /exclusivo/);
    await rpc(boss, 'select public.leer_notificaciones(null) as result');
    assert.equal((await db.query('select leida from public.notificaciones')).rows[0].leida, true);
    await db.exec(`insert into public.turnos(descripcion,hora_inicio,hora_fin) values ('Turno','08:00','16:00');
      insert into public.bitacoras(id_equipo,id_area,id_tecnico,id_turno,tipo_mantenimiento,descripcion,fecha_registro,dispositivo_id)
      values (${machine.id_equipo},${area.id_area},${tech.id_tecnico},1,'Preventivo','Historial',now(),'${device}');`);
    await assert.rejects(catalog(boss, 'equipos', 'eliminar', machine.id_equipo, {}), /historial/);
    await assert.rejects(catalog(boss, 'areas', 'eliminar', area.id_area, {}), /historial/);
    await assert.rejects(catalog(boss, 'tecnicos', 'crear', null, { nombre: '' }), /Nombre obligatorio/);
    await assert.rejects(rpc(boss, entrySQL, ['10000000-0000-0000-0000-000000000002', -1, 'Prueba']), /positiva/);
    await assert.rejects(profile(device), /exclusivo/);
    await assert.rejects(profile('', 'anon'), /permission denied/);
    const createPart = 'select public.crear_refaccion($1,$2,$3) as result';
    await assert.rejects(rpc(device, createPart, ['Rodamiento','R1','General']), /exclusivo/);
    const part = await rpc(boss, createPart, [' Rodamiento ', ' R1 ', ' General ']);
    assert.equal(part.nombre, 'Rodamiento'); assert.equal(part.stock, 0); assert.equal(part.codigo, 'R1');
    await assert.rejects(rpc(boss, createPart, ['Rodamiento','R1','General']), /Ya existe/);
    await assert.rejects(rpc(boss, createPart, [' ','R2','General']), /obligatorios/);
    await assert.rejects(rpc(boss, createPart, ['Pieza','R2','x'.repeat(51)]), /longitud/);
    assert.equal((await db.query("select count(*)::int as n from public.piezas where codigo='R1'")).rows[0].n, 1);
    assert.equal((await db.query("select has_function_privilege('anon','public.crear_refaccion(text,text,text)','EXECUTE') as allowed")).rows[0].allowed, false);
    await db.exec(`update campoterra_private.accesos set activo=false where auth_user_id='${boss}'`);
    await assert.rejects(rpc(boss, createPart, ['Pieza','R2','General']), /exclusivo/);
    await assert.rejects(profile(boss), /exclusivo/);
    await assert.rejects(catalog(boss, 'areas', 'crear', null, { nombre: 'Revocado' }), /exclusivo/);
  } finally { await db.close(); }
});
