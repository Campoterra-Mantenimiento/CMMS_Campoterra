begin;
create function public.acceso_encargado()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare nombre_encargado text;
begin
    select nombre into nombre_encargado from campoterra_private.accesos
    where auth_user_id = auth.uid() and tipo = 'encargado' and activo;
    if not found then
        raise sqlstate 'PT403' using message = 'Acceso exclusivo del encargado activo';
    end if;
    return jsonb_build_object('username', auth.jwt()->>'email', 'rol','Administrador',
        'nombre',nombre_encargado,'cargo','Encargado de mantenimiento');
end;
$$;
revoke all on function public.acceso_encargado() from public, anon, authenticated;
grant execute on function public.acceso_encargado() to authenticated;
notify pgrst, 'reload schema';
commit;
