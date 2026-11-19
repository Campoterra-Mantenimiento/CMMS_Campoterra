begin;
create function public.crear_refaccion(p_nombre text, p_codigo text, p_categoria text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare salida jsonb;
begin
    perform 1 from campoterra_private.accesos where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
    if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
    if p_nombre is null or length(trim(p_nombre)) not between 1 and 100
       or p_codigo is null or length(trim(p_codigo)) not between 1 and 50
       or p_categoria is null or length(trim(p_categoria)) not between 1 and 50 then
        raise sqlstate 'PT422' using message='Nombre, código y categoría son obligatorios; revisa su longitud';
    end if;
    insert into public.piezas(nombre,codigo,categoria,stock,icon)
    values(trim(p_nombre),trim(p_codigo),trim(p_categoria),0,'cog-outline')
    returning to_jsonb(piezas.*) into salida;
    return salida;
exception when unique_violation then
    raise sqlstate 'PT409' using message='Ya existe una refacción con ese código. Revisa el inventario antes de volver a guardarla.';
end;
$$;
revoke all on function public.crear_refaccion(text,text,text) from public,anon,authenticated;
grant execute on function public.crear_refaccion(text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
