const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
test('evaluaciones: permisos, límites, fechas, duplicados y revisión concurrente',async()=>{
 const db=new PGlite();
 const boss='00000000-0000-0000-0000-000000000001', device='00000000-0000-0000-0000-000000000002';
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;insert into auth.users values('${boss}'),('${device}');`);
  for(const name of ['202610060001_pilot_base.sql','202610280008_evaluaciones.sql','202610290009_evaluaciones_sin_turno.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8'));
  await db.exec(`insert into campoterra_private.accesos(auth_user_id,tipo,nombre) values('${boss}','encargado','Jefe'),('${device}','dispositivo','Tablet');
   insert into public.tecnicos(nombre) values('Técnico');insert into public.turnos(descripcion,hora_inicio,hora_fin) values('Mañana','06:00','14:00');`);
  async function run(user,sql,args=[]){await db.exec('begin;set local role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);const r=await db.query(sql,args);await db.exec('commit');return r.rows;}catch(e){await db.exec('rollback');throw e;}}
  const save=(user,revision=0,quality=4,date='2020-01-01')=>run(user,'select public.guardar_evaluacion(1,1,$1::date,$2,3,5,4,\'Nota\',$3) as r',[date,quality,revision]);
  await assert.rejects(save(device),/exclusivo/);
  await assert.rejects(save(boss,0,0),/criterios/);
  await assert.rejects(save(boss,0,null),/criterios/);
  await assert.rejects(save(boss,0,6),/criterios/);
  await assert.rejects(save(boss,0,4,'2999-01-01'),/futura/);
  const first=(await save(boss))[0].r;assert.equal(first.resultado,80);assert.equal(first.revision,1);
  await assert.rejects(save(boss),/ya existe/);
  const updated=(await save(boss,1,5))[0].r;assert.equal(updated.resultado,85);assert.equal(updated.revision,2);assert.equal(updated.creado_en,first.creado_en);
  await assert.rejects(save(boss,1),/cambió/);
  assert.equal((await run(device,'select * from public.evaluaciones')).length,0);
  assert.equal((await run(boss,'select * from public.evaluaciones')).length,1);
  await assert.rejects(run(boss,'update public.evaluaciones set calidad=1'),/permission denied/);
  const noShift=(await run(boss,"select public.guardar_evaluacion(1,null,'2020-01-02',4,3,5,4,'',0) as r"))[0].r;
  assert.equal(noShift.id_turno,null); assert.equal(noShift.resultado,80);
  const edited=(await run(boss,"select public.guardar_evaluacion(1,null,'2020-01-02',5,3,5,4,'',1) as r"))[0].r;
  assert.equal(edited.id_turno,null); assert.equal(edited.resultado,85);
  assert.equal(updated.id_turno,1);
  await db.exec(`update campoterra_private.accesos set activo=false where auth_user_id='${boss}'`);
  await assert.rejects(save(boss,2),/exclusivo/);
  assert.equal((await run(boss,'select * from public.evaluaciones')).length,0);
 }finally{await db.close();}
});
