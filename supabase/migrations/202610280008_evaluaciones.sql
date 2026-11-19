begin;
create table public.evaluaciones (
 id_evaluacion bigint generated always as identity primary key,
 id_tecnico integer not null references public.tecnicos,
 id_turno integer not null references public.turnos,
 fecha_trabajo date not null,
 calidad integer not null check (calidad between 1 and 5),
 cumplimiento integer not null check (cumplimiento between 1 and 5),
 orden integer not null check (orden between 1 and 5),
 documentacion integer not null check (documentacion between 1 and 5),
 resultado integer generated always as ((calidad+cumplimiento+orden+documentacion)*5) stored,
 observaciones text not null default '' check (length(observaciones)<=2000),
 creado_por uuid not null references auth.users,
 creado_en timestamptz not null default now(),
 actualizado_por uuid not null references auth.users,
 actualizado_en timestamptz not null default now(),
 revision integer not null default 1,
 unique(id_tecnico,fecha_trabajo)
);
create index on public.evaluaciones(fecha_trabajo);
alter table public.evaluaciones enable row level security;
revoke all on public.evaluaciones from public,anon,authenticated;
revoke all on sequence public.evaluaciones_id_evaluacion_seq from public,anon,authenticated;
grant select on public.evaluaciones to authenticated;
create policy encargado_lectura on public.evaluaciones for select to authenticated
 using ((select campoterra_private.tipo_acceso())='encargado');

create function public.guardar_evaluacion(p_tecnico integer,p_turno integer,p_fecha date,
 p_calidad integer,p_cumplimiento integer,p_orden integer,p_documentacion integer,
 p_observaciones text,p_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare salida jsonb;
begin
 perform 1 from campoterra_private.accesos where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
 if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
 if p_fecha is null or p_fecha>(now() at time zone 'America/Mexico_City')::date then
  raise sqlstate 'PT422' using message='Selecciona una fecha de trabajo que no sea futura'; end if;
 if p_calidad is null or p_calidad not between 1 and 5 or p_cumplimiento is null or p_cumplimiento not between 1 and 5
 or p_orden is null or p_orden not between 1 and 5 or p_documentacion is null or p_documentacion not between 1 and 5
 or length(coalesce(p_observaciones,''))>2000 or p_revision is null or p_revision<0 then
  raise sqlstate 'PT422' using message='Completa los cuatro criterios del 1 al 5 y revisa las observaciones'; end if;
 if p_revision=0 then
  insert into public.evaluaciones(id_tecnico,id_turno,fecha_trabajo,calidad,cumplimiento,orden,documentacion,observaciones,creado_por,actualizado_por)
  values(p_tecnico,p_turno,p_fecha,p_calidad,p_cumplimiento,p_orden,p_documentacion,coalesce(p_observaciones,''),auth.uid(),auth.uid())
  on conflict(id_tecnico,fecha_trabajo) do nothing returning to_jsonb(evaluaciones.*) into salida;
 else
  update public.evaluaciones set id_turno=p_turno,calidad=p_calidad,cumplimiento=p_cumplimiento,orden=p_orden,
   documentacion=p_documentacion,observaciones=coalesce(p_observaciones,''),actualizado_por=auth.uid(),actualizado_en=now(),revision=revision+1
  where id_tecnico=p_tecnico and fecha_trabajo=p_fecha and revision=p_revision returning to_jsonb(evaluaciones.*) into salida;
 end if;
 if salida is null then raise sqlstate 'PT409' using message='La evaluación cambió o ya existe. Vuelve a consultar el día antes de guardar.'; end if;
 return salida;
end;
$$;
revoke all on function public.guardar_evaluacion(integer,integer,date,integer,integer,integer,integer,text,integer) from public,anon,authenticated;
grant execute on function public.guardar_evaluacion(integer,integer,date,integer,integer,integer,integer,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
