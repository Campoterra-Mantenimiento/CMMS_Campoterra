-- Comprobación de instalación, sin crear usuarios ni reportes.
do $$
begin
    if to_regprocedure('public.registrar_reporte(uuid,jsonb)') is null then
        raise exception 'Falta instalar registrar_reporte';
    end if;
    if has_function_privilege('anon','public.registrar_reporte(uuid,jsonb)','EXECUTE') then
        raise exception 'La función permite acceso anónimo';
    end if;
    if not has_function_privilege('authenticated','public.registrar_reporte(uuid,jsonb)','EXECUTE') then
        raise exception 'Falta permiso de ejecución autenticada';
    end if;
    if has_table_privilege('authenticated','public.bitacoras','INSERT')
       or has_table_privilege('authenticated','public.piezas','UPDATE') then
        raise exception 'Se permiten escrituras directas fuera de la función';
    end if;
end;
$$;
select 'Función de reportes instalada; permisos iniciales correctos.' as resultado;
