-- Verifica instalación y permisos; no modifica datos.
do $$
declare firma text;
begin
    foreach firma in array array[
        'public.administrar_catalogo(text,text,integer,jsonb)',
        'public.registrar_entrada(uuid,integer,integer,text)',
        'public.leer_notificaciones(integer)'
    ] loop
        if to_regprocedure(firma) is null then raise exception 'Falta instalar %',firma; end if;
        if has_function_privilege('anon',firma,'EXECUTE') then raise exception 'Acceso anónimo en %',firma; end if;
        if not has_function_privilege('authenticated',firma,'EXECUTE') then raise exception 'Falta permiso de ejecución en %',firma; end if;
    end loop;
    if has_table_privilege('authenticated','public.piezas','UPDATE') then raise exception 'Inventario permite escritura directa'; end if;
    if has_table_privilege('authenticated','campoterra_private.entradas_idempotencia','SELECT') then raise exception 'Control privado expuesto'; end if;
end;
$$;
select 'Administración instalada; permisos correctos.' as resultado;
