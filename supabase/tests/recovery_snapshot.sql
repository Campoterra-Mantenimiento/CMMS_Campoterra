-- Ejecutar en SQL Editor como postgres, en origen y destino.
-- Solo lectura. Guardar los resultados fuera del repositorio.
-- Comparar durante una pausa de capturas y cambios administrativos.
begin transaction isolation level repeatable read read only;
select 'public.tecnicos' as tabla, count(*) as filas from public.tecnicos
union all select 'public.turnos',count(*) from public.turnos
union all select 'public.areas_mantenimiento',count(*) from public.areas_mantenimiento
union all select 'public.equipos',count(*) from public.equipos
union all select 'public.piezas',count(*) from public.piezas
union all select 'public.bitacoras',count(*) from public.bitacoras
union all select 'public.movimientos_piezas',count(*) from public.movimientos_piezas
union all select 'public.notificaciones',count(*) from public.notificaciones
union all select 'campoterra_private.accesos',count(*) from campoterra_private.accesos
union all select 'campoterra_private.reportes_idempotencia',count(*) from campoterra_private.reportes_idempotencia
union all select 'campoterra_private.entradas_idempotencia',count(*) from campoterra_private.entradas_idempotencia
union all select 'auth.users',count(*) from auth.users
union all select 'auth.identities',count(*) from auth.identities
order by tabla;

-- Verificar existencias individualmente, no solo el total.
select id_pieza,codigo,stock from public.piezas order by id_pieza;
select tipo,count(*) as movimientos,sum(cantidad) as unidades
from public.movimientos_piezas group by tipo order by tipo;

-- Estos conteos deben ser cero.
select 'accesos_sin_usuario' as problema,count(*) as filas
from campoterra_private.accesos a left join auth.users u on u.id=a.auth_user_id where u.id is null
union all
select 'reportes_sin_dispositivo',count(*) from public.bitacoras b
left join campoterra_private.accesos a on a.auth_user_id=b.dispositivo_id where a.auth_user_id is null
union all
select 'stock_negativo',count(*) from public.piezas where stock<0;

select n.nspname as esquema,c.relname as tabla,c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','campoterra_private') and c.relkind='r'
order by esquema,tabla;
commit;
