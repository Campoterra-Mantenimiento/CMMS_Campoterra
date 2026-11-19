begin;
create function public.eliminar_actividad(p_id uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare eliminado uuid;
begin
 perform 1 from campoterra_private.accesos where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
 if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
 if p_id is null or p_revision is null or p_revision<1 then
  raise sqlstate 'PT422' using message='Actividad o revisión inválida'; end if;
 delete from public.actividades_mantenimiento where id_actividad=p_id and revision=p_revision
 returning id_actividad into eliminado;
 if eliminado is null then raise sqlstate 'PT409' using message='La actividad cambió o ya fue eliminada. Consulta de nuevo antes de continuar.'; end if;
 return jsonb_build_object('id_actividad',eliminado,'mensaje','Actividad eliminada');
end;
$$;
revoke all on function public.eliminar_actividad(uuid,integer) from public,anon,authenticated;
grant execute on function public.eliminar_actividad(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
