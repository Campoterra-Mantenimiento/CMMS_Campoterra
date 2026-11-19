do $$
begin
    if not has_function_privilege('authenticated','public.crear_refaccion(text,text,text)','EXECUTE')
       or has_function_privilege('anon','public.crear_refaccion(text,text,text)','EXECUTE')
       or has_table_privilege('authenticated','public.piezas','INSERT') then
        raise exception 'Revisar permisos del alta de refacciones';
    end if;
end;
$$;
select 'Alta de refacciones instalada; permisos correctos.' as resultado;
