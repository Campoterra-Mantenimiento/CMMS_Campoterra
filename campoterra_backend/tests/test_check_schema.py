"""Diagnóstico con inspectores simulados; no carga .env ni conecta a MySQL."""
from contextlib import redirect_stdout
import importlib.util
from io import StringIO
from pathlib import Path
from types import SimpleNamespace, ModuleType
import unittest
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_schema.py"
spec = importlib.util.spec_from_file_location("schema_check_test", SCRIPT)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class CheckSchemaTests(unittest.TestCase):
    def setUp(self):
        self.inspector = Mock()
        self.inspector.get_table_names.return_value = ["usuarios", "bitacoras", "areas_mantenimiento"]
        self.inspector.get_columns.return_value = [{"name": "nombre"}]
        self.context = Mock()
        self.context.get_current_heads.return_value = ()
        self.diff = Mock(return_value=[])
        sqlalchemy = ModuleType("sqlalchemy")
        sqlalchemy.inspect = Mock(return_value=self.inspector)
        sqlalchemy.text = lambda sql: sql
        migration = ModuleType("alembic.migration")
        migration.MigrationContext = Mock()
        migration.MigrationContext.configure.return_value = self.context
        autogen = ModuleType("alembic.autogenerate")
        autogen.compare_metadata = self.diff
        self.modules = patch.dict("sys.modules", {
            "sqlalchemy": sqlalchemy, "alembic": ModuleType("alembic"),
            "alembic.migration": migration, "alembic.autogenerate": autogen,
        })
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.connection = Mock()
        self.connection.execute.return_value.scalars.return_value = check.AREAS_INICIALES
        self.metadata = SimpleNamespace(sorted_tables=[])

    def diagnose(self):
        result = check.inspeccionar(self.connection, self.metadata)
        output = StringIO()
        with redirect_stdout(output):
            code = check.recomendar(result)
        return code, output.getvalue()

    def test_complete_schema_uses_fixed_revision(self):
        code, output = self.diagnose()
        self.assertEqual(code, 0)
        self.assertIn("stamp 8fb1b3aaed4d", output)
        self.assertNotIn("stamp head", output)
        self.diff.assert_called_once_with(self.context, self.metadata)

    def test_nullable_or_other_schema_drift_blocks_stamp(self):
        for drift in ("modify_nullable bitacoras.id_equipo", "add_table piezas",
                      "modify_type usuarios.nombre", "add_fk bitacoras.id_area"):
            with self.subTest(drift=drift):
                self.diff.return_value = [drift]
                code, output = self.diagnose()
                self.assertEqual(code, 2)
                self.assertIn(drift, output)
                self.assertNotIn("alembic stamp", output)

    def test_missing_seed_blocks_stamp(self):
        self.connection.execute.return_value.scalars.return_value = check.AREAS_INICIALES[1:]
        code, output = self.diagnose()
        self.assertEqual(code, 2)
        self.assertIn("Faltan áreas iniciales: Producción", output)
        self.assertNotIn("alembic stamp", output)

    def test_empty_database(self):
        self.inspector.get_table_names.return_value = []
        code, output = self.diagnose()
        self.assertEqual(code, 0)
        self.assertIn("upgrade head", output)
        self.connection.execute.assert_not_called()

    def test_partial_database_is_not_empty(self):
        self.inspector.get_table_names.return_value = ["equipos"]
        self.diff.return_value = ["add_table usuarios"]
        code, output = self.diagnose()
        self.assertEqual(code, 2)
        self.assertNotIn("Base vacía", output)

    def test_existing_revision_never_restamped(self):
        self.context.get_current_heads.return_value = ("8fb1b3aaed4d",)
        code, output = self.diagnose()
        self.assertEqual(code, 0)
        self.assertNotIn("alembic stamp", output)

    def test_version_without_tables_blocks(self):
        self.inspector.get_table_names.return_value = ["alembic_version"]
        self.context.get_current_heads.return_value = ("8fb1b3aaed4d",)
        self.assertEqual(self.diagnose()[0], 2)

    def test_primary_key_mismatch_blocks(self):
        self.metadata.sorted_tables = [SimpleNamespace(name="usuarios",
            primary_key=SimpleNamespace(columns=[SimpleNamespace(name="id_usuario")]))]
        self.inspector.get_pk_constraint.return_value = {"constrained_columns": ["username"]}
        code, output = self.diagnose()
        self.assertEqual(code, 2)
        self.assertIn("Clave primaria distinta", output)

    def test_inspection_failure_is_not_treated_as_missing(self):
        self.inspector.get_columns.side_effect = RuntimeError("inspection failed")
        with self.assertRaisesRegex(RuntimeError, "inspection failed"):
            self.diagnose()


if __name__ == "__main__":
    unittest.main()
