begin;
-- Las evaluaciones son por tecnico y fecha, sin requerir un turno.
-- Se conservan los turnos de los registros anteriores.
alter table public.evaluaciones alter column id_turno drop not null;
notify pgrst, 'reload schema';
commit;
