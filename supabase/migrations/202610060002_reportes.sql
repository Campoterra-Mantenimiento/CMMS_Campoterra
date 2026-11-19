-- Ejecutar después de 202610060001_pilot_base.sql, como postgres.
begin;

create function public.registrar_reporte(p_clave uuid, p_reporte jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    dispositivo uuid := auth.uid();
    anterior campoterra_private.reportes_idempotencia%rowtype;
    folio integer;
    tecnico integer;
    turno integer;
    area integer;
    equipo integer;
    fecha timestamptz;
    item jsonb;
    consumo record;
    pieza public.piezas%rowtype;
    detalles text := '';
begin
    -- La identidad viene del token, nunca del cuerpo enviado por la tablet.
    perform 1 from campoterra_private.accesos
      where auth_user_id = dispositivo and tipo = 'dispositivo' and activo
      for share;
    if not found then
        raise sqlstate 'PT403' using message = 'Dispositivo no autorizado o desactivado';
    end if;
    if p_clave is null or p_reporte is null or jsonb_typeof(p_reporte) <> 'object' then
        raise sqlstate 'PT422' using message = 'Clave y reporte son obligatorios';
    end if;

    -- Serializa la misma clave entre sesiones; se libera al finalizar la transacción.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_clave::text, 0));
    select * into anterior from campoterra_private.reportes_idempotencia
      where idempotency_key = p_clave;
    if found then
        if anterior.dispositivo_id <> dispositivo or anterior.payload <> p_reporte then
            raise sqlstate 'PT409' using message = 'La clave ya se utilizó para otro reporte';
        end if;
        return jsonb_build_object('status','success','folio_bitacora',anterior.response_folio,
            'message','¡Reporte guardado con éxito!','idempotent_replay',true);
    end if;

    if not (p_reporte ?& array['tecnico_id','turno_id','area_id','tipo_trabajo','descripcion','fecha_registro','piezas'])
       or jsonb_typeof(p_reporte->'descripcion') is distinct from 'string'
       or length(trim(p_reporte->>'descripcion')) not between 1 and 10000
       or coalesce(p_reporte->>'tipo_trabajo','') not in ('Preventivo','Correctivo')
       or jsonb_typeof(p_reporte->'piezas') is distinct from 'array' then
        raise sqlstate 'PT422' using message = 'Datos del reporte incompletos o inválidos';
    end if;
    if jsonb_array_length(p_reporte->'piezas') > 100 then
        raise sqlstate 'PT422' using message = 'Demasiadas piezas en el reporte';
    end if;
    begin
        if coalesce(p_reporte->>'tecnico_id','') !~ '^[1-9][0-9]*$'
           or coalesce(p_reporte->>'turno_id','') !~ '^[1-9][0-9]*$'
           or coalesce(p_reporte->>'area_id','') !~ '^[1-9][0-9]*$'
           or (p_reporte->>'equipo_id' is not null and p_reporte->>'equipo_id' !~ '^[1-9][0-9]*$')
           or coalesce(p_reporte->>'fecha_registro','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
            raise sqlstate 'PT422' using message = 'Identificadores o fecha inválidos';
        end if;
        tecnico := (p_reporte->>'tecnico_id')::integer;
        turno := (p_reporte->>'turno_id')::integer;
        area := (p_reporte->>'area_id')::integer;
        equipo := (p_reporte->>'equipo_id')::integer;
        fecha := (p_reporte->>'fecha_registro')::timestamptz;
    exception when data_exception then
        raise sqlstate 'PT422' using message = 'Identificadores o fecha inválidos';
    end;
    perform 1 from public.tecnicos where id_tecnico = tecnico and estado = 'Activo' for share;
    if not found then raise sqlstate 'PT422' using message = 'Técnico no activo'; end if;
    perform 1 from public.turnos where id_turno = turno for share;
    if not found then raise sqlstate 'PT422' using message = 'Turno inexistente'; end if;
    perform 1 from public.areas_mantenimiento where id_area = area and activa for share;
    if not found then raise sqlstate 'PT422' using message = 'Área no activa'; end if;
    if equipo is not null then
        perform 1 from public.equipos where id_equipo = equipo for share;
        if not found then raise sqlstate 'PT422' using message = 'Equipo inexistente'; end if;
    end if;

    for item in select value from jsonb_array_elements(p_reporte->'piezas') loop
        if jsonb_typeof(item) <> 'object'
           or coalesce(item->>'partId','') !~ '^[1-9][0-9]*$'
           or coalesce(item->>'qty','') !~ '^[1-9][0-9]*$' then
            raise sqlstate 'PT422' using message = 'Pieza y cantidad deben ser enteros positivos';
        end if;
        if (item->>'partId')::numeric > 2147483647 or (item->>'qty')::numeric > 2147483647 then
            raise sqlstate 'PT422' using message = 'Cantidad o identificador fuera de rango';
        end if;
    end loop;

    insert into public.bitacoras(id_equipo,id_area,id_tecnico,id_turno,
        tipo_mantenimiento,descripcion,fecha_registro,dispositivo_id)
    values (equipo,area,tecnico,turno,p_reporte->>'tipo_trabajo',
        p_reporte->>'descripcion',fecha,dispositivo)
    returning id_bitacora into folio;

    -- Agrupa repeticiones y bloquea siempre por ID para evitar descuentos perdidos.
    for consumo in
        select (value->>'partId')::integer as id, sum((value->>'qty')::bigint) as cantidad
        from jsonb_array_elements(p_reporte->'piezas') group by 1 order by 1
    loop
        select * into pieza from public.piezas where id_pieza = consumo.id for update;
        if not found then raise sqlstate 'PT422' using message = 'Pieza inexistente'; end if;
        if pieza.stock < consumo.cantidad then
            raise sqlstate 'PT409' using message = 'Stock insuficiente para ' || pieza.nombre;
        end if;
        update public.piezas set stock = stock - consumo.cantidad where id_pieza = consumo.id;
        insert into public.movimientos_piezas(id_pieza,id_bitacora,tipo,cantidad,motivo)
        values (consumo.id,folio,'Salida',consumo.cantidad,'Reporte de mantenimiento #' || folio);
        detalles := detalles || case when detalles = '' then '' else ', ' end
                    || pieza.nombre || ' (Cant: ' || consumo.cantidad || ')';
    end loop;
    update public.bitacoras set detalles_repuestos = nullif(detalles,'') where id_bitacora = folio;
    insert into public.notificaciones(tipo,titulo,mensaje,enlace,referencia_id)
    values ('nuevo_reporte','Nuevo reporte registrado','Reporte de mantenimiento #' || folio,
            'bitacoras.html',folio);
    insert into campoterra_private.reportes_idempotencia
        (idempotency_key,dispositivo_id,payload,response_folio)
    values (p_clave,dispositivo,p_reporte,folio);
    return jsonb_build_object('status','success','folio_bitacora',folio,
        'message','¡Reporte guardado con éxito!','idempotent_replay',false);
end;
$$;

revoke all on function public.registrar_reporte(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.registrar_reporte(uuid,jsonb) to authenticated;
-- No se conceden INSERT/UPDATE/DELETE sobre tablas a los clientes.
notify pgrst, 'reload schema';
commit;
