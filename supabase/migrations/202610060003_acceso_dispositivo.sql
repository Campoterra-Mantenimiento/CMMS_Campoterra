begin;
create function public.acceso_dispositivo()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
    if not exists (select 1 from campoterra_private.accesos
        where auth_user_id = auth.uid() and tipo = 'dispositivo' and activo) then
        raise sqlstate 'PT403' using message = 'Dispositivo no autorizado o desactivado';
    end if;
    return jsonb_build_object('autorizado', true);
end;
$$;
revoke all on function public.acceso_dispositivo() from public, anon, authenticated;
grant execute on function public.acceso_dispositivo() to authenticated;
notify pgrst, 'reload schema';
commit;
