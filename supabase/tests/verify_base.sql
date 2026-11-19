-- Ejecutar como postgres en SQL Editor DESPUÉS de la migración.
-- No crea usuarios Auth. Los datos ficticios se revierten al final.
begin;

do $$
declare t text;
begin
    foreach t in array array['tecnicos', 'turnos', 'areas_mantenimiento', 'equipos',
                             'piezas', 'bitacoras', 'movimientos_piezas', 'notificaciones']
    loop
        if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
            raise exception 'Falta RLS: %', t;
        end if;
        if has_table_privilege('anon', 'public.' || t, 'SELECT') then
            raise exception 'Lectura anónima permitida: %', t;
        end if;
        if has_table_privilege('authenticated', 'public.' || t, 'INSERT')
            or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
            or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
            raise exception 'Escritura directa permitida: %', t;
        end if;
    end loop;
    if has_table_privilege('authenticated', 'campoterra_private.accesos', 'SELECT')
        or has_table_privilege('authenticated', 'campoterra_private.accesos', 'UPDATE') then
        raise exception 'Se expuso la tabla de permisos';
    end if;
    if has_function_privilege('anon', 'campoterra_private.tipo_acceso()', 'EXECUTE') then
        raise exception 'La función privada permite ejecución anónima';
    end if;
end;
$$;

-- Un ID inexistente no puede obtener acceso aunque tenga un token autenticado.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
insert into public.tecnicos (id_tecnico, nombre) values (-900001, 'PRUEBA TEMPORAL');
set local role authenticated;
do $$
begin
    if (select count(*) from public.tecnicos) <> 0 then
        raise exception 'Cuenta no autorizada puede leer técnicos';
    end if;
    if campoterra_private.tipo_acceso() is not null then
        raise exception 'Cuenta no autorizada obtuvo un rol';
    end if;
end;
$$;
reset role;
rollback;

select 'Verificación inicial completada; datos de prueba revertidos.' as resultado;
