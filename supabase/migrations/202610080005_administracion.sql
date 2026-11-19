begin;
create table campoterra_private.entradas_idempotencia (
    clave uuid primary key,
    encargado uuid not null references auth.users,
    payload jsonb not null,
    respuesta jsonb not null
);
alter table campoterra_private.entradas_idempotencia enable row level security;
revoke all on campoterra_private.entradas_idempotencia from public, anon, authenticated;

create function public.administrar_catalogo(p_catalogo text, p_accion text, p_id integer default null, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
<<administrar_catalogo>>
declare salida jsonb; nombre text; estado text;
begin
    perform 1 from campoterra_private.accesos where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
    if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
    if p_catalogo is null or p_catalogo not in ('equipos','tecnicos','areas')
       or p_accion is null or p_accion not in ('crear','editar','eliminar','estado')
       or p_datos is null or jsonb_typeof(p_datos)<>'object' then
        raise sqlstate 'PT422' using message='Operación inválida';
    end if;
    if p_accion<>'crear' and (p_id is null or p_id<=0) then raise sqlstate 'PT422' using message='Identificador requerido'; end if;
    if p_accion in ('crear','editar') then
        nombre := trim(p_datos->>'nombre');
        if nombre is null or length(nombre) not between 1 and 100 then raise sqlstate 'PT422' using message='Nombre obligatorio (máximo 100 caracteres)'; end if;
    end if;
    if p_catalogo='equipos' then
        if p_accion in ('crear','editar') then
            estado := coalesce(p_datos->>'estado','Operativo');
            if estado not in ('Operativo','En Mantenimiento','Inactivo') or coalesce(trim(p_datos->>'codigo_interno'),'')='' then
                raise sqlstate 'PT422' using message='Código o estado de maquinaria inválido';
            end if;
            if p_accion='crear' then
                insert into public.equipos(codigo_interno,nombre,area_ubicacion,estado,notas_adicionales)
                values(trim(p_datos->>'codigo_interno'),nombre,p_datos->>'area_ubicacion',estado,p_datos->>'notas_adicionales')
                returning to_jsonb(equipos.*) into salida;
            else
                update public.equipos set codigo_interno=trim(p_datos->>'codigo_interno'),nombre=administrar_catalogo.nombre,
                    area_ubicacion=p_datos->>'area_ubicacion',estado=administrar_catalogo.estado where id_equipo=p_id
                returning to_jsonb(equipos.*) into salida;
            end if;
        elsif p_accion='eliminar' then
            delete from public.equipos where id_equipo=p_id returning jsonb_build_object('mensaje','Equipo eliminado') into salida;
        else raise sqlstate 'PT422' using message='Operación de maquinaria inválida'; end if;
    elsif p_catalogo='tecnicos' then
        if p_accion in ('crear','editar') then
            estado := coalesce(p_datos->>'estado','Activo');
            if estado not in ('Activo','Inactivo') then raise sqlstate 'PT422' using message='Estado de técnico inválido'; end if;
            if p_accion='crear' then
                insert into public.tecnicos(nombre,estado) values(nombre,estado) returning to_jsonb(tecnicos.*) into salida;
            else
                update public.tecnicos set nombre=administrar_catalogo.nombre,estado=administrar_catalogo.estado where id_tecnico=p_id
                returning to_jsonb(tecnicos.*) into salida;
            end if;
        elsif p_accion='eliminar' then
            update public.tecnicos set estado='Inactivo' where id_tecnico=p_id
            returning jsonb_build_object('mensaje','Técnico desactivado; se conserva su historial') into salida;
        else raise sqlstate 'PT422' using message='Operación de técnico inválida'; end if;
    else
        if p_accion='crear' then
            insert into public.areas_mantenimiento(nombre) values(nombre) returning to_jsonb(areas_mantenimiento.*) into salida;
        elsif p_accion='editar' then
            update public.areas_mantenimiento set nombre=administrar_catalogo.nombre where id_area=p_id returning to_jsonb(areas_mantenimiento.*) into salida;
        elsif p_accion='estado' then
            if jsonb_typeof(p_datos->'activa') is distinct from 'boolean' then raise sqlstate 'PT422' using message='Estado de área inválido'; end if;
            update public.areas_mantenimiento set activa=(p_datos->>'activa')::boolean where id_area=p_id returning to_jsonb(areas_mantenimiento.*) into salida;
        else
            delete from public.areas_mantenimiento where id_area=p_id returning jsonb_build_object('mensaje','Área eliminada') into salida;
        end if;
    end if;
    if salida is null then raise sqlstate 'PT404' using message='Registro no encontrado'; end if;
    return salida;
exception
    when unique_violation then raise sqlstate 'PT409' using message='Ya existe ese código o nombre';
    when foreign_key_violation then raise sqlstate 'PT409' using message='Tiene historial de reportes; desactívalo en vez de eliminarlo';
    when data_exception or check_violation or not_null_violation then raise sqlstate 'PT422' using message='Revisa los campos y su longitud';
end;
$$;

create function public.registrar_entrada(p_clave uuid,p_pieza integer,p_cantidad integer,p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare anterior campoterra_private.entradas_idempotencia%rowtype; datos jsonb; salida jsonb;
begin
    perform 1 from campoterra_private.accesos where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
    if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
    if p_clave is null or p_pieza is null or p_cantidad is null or p_cantidad<=0
       or p_motivo is null or length(trim(p_motivo)) not between 1 and 255 then
        raise sqlstate 'PT422' using message='Pieza, cantidad positiva y motivo son obligatorios';
    end if;
    datos := jsonb_build_object('pieza',p_pieza,'cantidad',p_cantidad,'motivo',trim(p_motivo));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_clave::text, 1));
    select * into anterior from campoterra_private.entradas_idempotencia where clave=p_clave;
    if found then
        if anterior.encargado<>auth.uid() or anterior.payload<>datos then raise sqlstate 'PT409' using message='Clave utilizada para otra entrada'; end if;
        return anterior.respuesta;
    end if;
    update public.piezas set stock=stock+p_cantidad where id_pieza=p_pieza returning to_jsonb(piezas.*) into salida;
    if salida is null then raise sqlstate 'PT404' using message='Pieza no encontrada'; end if;
    insert into public.movimientos_piezas(id_pieza,tipo,cantidad,motivo) values(p_pieza,'Entrada',p_cantidad,trim(p_motivo));
    insert into campoterra_private.entradas_idempotencia values(p_clave,auth.uid(),datos,salida);
    return salida;
exception when numeric_value_out_of_range then raise sqlstate 'PT422' using message='Cantidad fuera de rango';
end;
$$;

create function public.leer_notificaciones(p_id integer default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
    perform 1 from campoterra_private.accesos where auth_user_id=auth.uid() and tipo='encargado' and activo for share;
    if not found then raise sqlstate 'PT403' using message='Acceso exclusivo del encargado activo'; end if;
    update public.notificaciones set leida=true where p_id is null or id_notificacion=p_id;
    if p_id is not null and not found then raise sqlstate 'PT404' using message='Notificación no encontrada'; end if;
    return jsonb_build_object('mensaje','Notificaciones marcadas como leídas');
end;
$$;
revoke all on function public.administrar_catalogo(text,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.registrar_entrada(uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function public.leer_notificaciones(integer) from public,anon,authenticated;
grant execute on function public.administrar_catalogo(text,text,integer,jsonb) to authenticated;
grant execute on function public.registrar_entrada(uuid,integer,integer,text) to authenticated;
grant execute on function public.leer_notificaciones(integer) to authenticated;
notify pgrst,'reload schema';
commit;
