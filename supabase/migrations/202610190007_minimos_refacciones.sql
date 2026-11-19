begin;
alter table public.piezas add column stock_minimo integer
    check (stock_minimo is null or stock_minimo >= 0);

create function public.configurar_minimo_refaccion(p_pieza integer, p_minimo integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare salida jsonb;
begin
    perform 1 from campoterra_private.accesos
    where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
    if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
    if p_minimo < 0 then raise sqlstate 'PT422' using message='El mínimo debe ser cero o mayor'; end if;
    update public.piezas set stock_minimo=p_minimo where id_pieza=p_pieza
    returning to_jsonb(piezas.*) into salida;
    if not found then raise sqlstate 'PT404' using message='La refacción no existe'; end if;
    return salida;
end;
$$;
revoke all on function public.configurar_minimo_refaccion(integer,integer) from public,anon,authenticated;
grant execute on function public.configurar_minimo_refaccion(integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
