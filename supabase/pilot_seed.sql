-- Solo campoterra-piloto. Datos FICTICIOS. Ejecutar una vez, como postgres.
begin;
do $$
begin
    if exists(select 1 from public.tecnicos) or exists(select 1 from public.turnos)
       or exists(select 1 from public.areas_mantenimiento) or exists(select 1 from public.equipos)
       or exists(select 1 from public.piezas) or exists(select 1 from public.bitacoras) then
        raise exception 'Los catálogos ya tienen datos; no se insertaron ejemplos';
    end if;
end;
$$;
insert into public.tecnicos(nombre) values ('Técnico de prueba A'),('Técnico de prueba B');
insert into public.turnos(descripcion,hora_inicio,hora_fin) values ('Turno de prueba','08:00','16:00');
insert into public.areas_mantenimiento(nombre) values ('Área de prueba');
insert into public.equipos(codigo_interno,nombre,area_ubicacion)
values ('PILOTO-E01','Máquina de prueba','Área de prueba');
insert into public.piezas(nombre,codigo,stock) values ('Rodamiento de prueba','PILOTO-P01',10);
commit;
