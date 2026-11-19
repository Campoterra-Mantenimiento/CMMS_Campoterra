// npm install --prefix <temporary-directory> @electric-sql/pglite
// Set PGLITE_MODULE to that directory's node_modules/@electric-sql/pglite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('initial migration: roles, RLS, revocation and read-only grants', async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase Auth contract; no cloud credentials or network used.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values
        ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002'),
        ('00000000-0000-0000-0000-000000000003');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/202610060001_pilot_base.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, 'verify_base.sql'), 'utf8'));
    await db.exec(`
      insert into campoterra_private.accesos(auth_user_id,tipo,nombre) values
        ('00000000-0000-0000-0000-000000000001','encargado','Encargado de prueba'),
        ('00000000-0000-0000-0000-000000000002','dispositivo','Tablet de prueba');
      insert into public.tecnicos(nombre,estado) values ('Activo','Activo'),('Inactivo','Inactivo');
      insert into public.turnos(descripcion,hora_inicio,hora_fin) values ('Prueba','08:00','16:00');
      insert into public.areas_mantenimiento(nombre) values ('Prueba');
      insert into public.bitacoras(id_area,id_tecnico,id_turno,tipo_mantenimiento,descripcion,fecha_registro,dispositivo_id)
        values (1,1,1,'Preventivo','Prueba',now(),'00000000-0000-0000-0000-000000000002');
    `);
    async function asUser(id, sql) {
      await db.exec('begin; set local role authenticated;');
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
        return (await db.query(sql)).rows;
      } finally { await db.exec('rollback'); }
    }
    const boss = '00000000-0000-0000-0000-000000000001';
    const tablet = '00000000-0000-0000-0000-000000000002';
    const outsider = '00000000-0000-0000-0000-000000000003';
    assert.equal((await asUser(boss, 'select * from public.tecnicos')).length, 2);
    assert.equal((await asUser(tablet, 'select * from public.tecnicos')).length, 1);
    assert.equal((await asUser(outsider, 'select * from public.tecnicos')).length, 0);
    assert.equal((await asUser(tablet, 'select * from public.bitacoras')).length, 1);
    await assert.rejects(asUser(tablet, "insert into public.tecnicos(nombre) values ('Intruso')"), /permission denied/);
    await assert.rejects(asUser(boss, 'update public.piezas set stock=100'), /permission denied/);
    await assert.rejects(asUser(tablet, "update campoterra_private.accesos set tipo='encargado'"), /permission denied/);
    await db.exec(`update campoterra_private.accesos set activo=false where tipo='dispositivo'`);
    assert.equal((await asUser(tablet, 'select * from public.tecnicos')).length, 0);
    assert.equal((await asUser(tablet, 'select * from public.bitacoras')).length, 0);
  } finally { await db.close(); }
});
