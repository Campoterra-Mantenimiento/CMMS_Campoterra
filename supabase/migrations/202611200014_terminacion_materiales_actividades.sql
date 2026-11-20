-- Fecha elegida por el encargado y materiales informativos, sin movimientos de inventario.
begin;
alter table public.actividades_mantenimiento
 add column fecha_terminacion date check (fecha_terminacion >= fecha_trabajo),
 add column materiales text not null default '' check (length(materiales)<=2000);
drop function public.guardar_actividad(uuid,integer,date,text,text,text,text,integer,text);
create or replace function public.guardar_actividad(p_id uuid,p_tecnico integer,p_fecha date,p_descripcion text,
 p_tipo text,p_estado text,p_observaciones text,p_revision integer,p_turno text default null,p_fecha_terminacion date default null,p_materiales text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.actividades_mantenimiento; salida jsonb;
begin
 perform 1 from campoterra_private.accesos where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
 if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
 if p_turno is not null and p_turno not in ('Día','Tarde','Noche') then
  raise sqlstate 'PT422' using message='Selecciona un turno válido'; end if;
 if p_id is null or p_fecha is null or p_tecnico is null or p_revision is null or p_revision<0
 or coalesce(length(trim(p_descripcion)),0) not between 1 and 1000
 or p_tipo is null or p_tipo not in ('Preventiva','Correctiva','Emergente')
 or p_estado is null or p_estado not in ('Pendiente','Realizada','No realizada')
 or length(coalesce(p_observaciones,''))>2000 then
  raise sqlstate 'PT422' using message='Revisa técnico, fecha, actividad, tipo, resultado y observaciones'; end if;
 if p_estado='No realizada' and trim(coalesce(p_observaciones,''))='' then
  raise sqlstate 'PT422' using message='Indica por qué no se realizó la actividad'; end if;
 if p_fecha>(now() at time zone 'America/Mexico_City')::date and (p_estado<>'Pendiente' or p_tipo='Emergente') then
  raise sqlstate 'PT422' using message='Para fechas futuras solo puedes planear actividades pendientes'; end if;
 if p_fecha_terminacion < p_fecha then raise sqlstate 'PT422' using message='La fecha de terminación no puede ser anterior a la fecha de la actividad'; end if;
 if length(coalesce(p_materiales,''))>2000 then raise sqlstate 'PT422' using message='Materiales admite hasta 2000 caracteres'; end if;
 if p_revision=0 then
  perform 1 from public.tecnicos where id_tecnico=p_tecnico and estado='Activo' for share;
  if not found then raise sqlstate 'PT422' using message='Selecciona un técnico activo'; end if;
  insert into public.actividades_mantenimiento(id_actividad,id_tecnico,fecha_trabajo,descripcion,tipo,estado,observaciones,turno,fecha_terminacion,materiales,creado_por,actualizado_por)
   values(p_id,p_tecnico,p_fecha,trim(p_descripcion),p_tipo,p_estado,coalesce(p_observaciones,''),p_turno,p_fecha_terminacion,coalesce(p_materiales,''),auth.uid(),auth.uid())
   on conflict(id_actividad) do nothing returning to_jsonb(actividades_mantenimiento.*) into salida;
  if salida is null then
   select * into anterior from public.actividades_mantenimiento where id_actividad=p_id;
   if anterior.revision=1 and anterior.creado_por=auth.uid() and anterior.id_tecnico=p_tecnico
    and anterior.fecha_trabajo=p_fecha and anterior.descripcion=trim(p_descripcion) and anterior.tipo=p_tipo
    and anterior.fecha_terminacion is not distinct from p_fecha_terminacion and anterior.materiales=coalesce(p_materiales,'')
    and anterior.turno is not distinct from p_turno and anterior.estado=p_estado and anterior.observaciones=coalesce(p_observaciones,'') then return to_jsonb(anterior); end if;
  end if;
 else
  update public.actividades_mantenimiento set turno=coalesce(p_turno,turno),descripcion=trim(p_descripcion),tipo=p_tipo,estado=p_estado,
   fecha_terminacion=p_fecha_terminacion,materiales=coalesce(p_materiales,materiales),observaciones=coalesce(p_observaciones,''),actualizado_por=auth.uid(),actualizado_en=now(),revision=revision+1
   where id_actividad=p_id and revision=p_revision and id_tecnico=p_tecnico and fecha_trabajo=p_fecha
   returning to_jsonb(actividades_mantenimiento.*) into salida;
 end if;
 if salida is null then raise sqlstate 'PT409' using message='La actividad cambió. Consulta de nuevo antes de editarla.'; end if;
 return salida;
end;
$$;
revoke all on function public.guardar_actividad(uuid,integer,date,text,text,text,text,integer,text,date,text) from public,anon,authenticated;
grant execute on function public.guardar_actividad(uuid,integer,date,text,text,text,text,integer,text,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
