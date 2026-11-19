"""Pruebas aisladas: no importan config ni abren conexiones a MySQL."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "repair_area_fk.py"


class RepairAreaFkTests(unittest.TestCase):
    def setUp(self):
        # Ejecuta solo la función para no cargar .env ni dependencias de conexión.
        tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
        function = next(node for node in tree.body
                        if isinstance(node, ast.FunctionDef) and node.name == "repair_area_fk")
        self.inspector = Mock()
        self.inspector.get_foreign_keys.return_value = []
        self.inspector.get_columns.return_value = [{"name": "id_area"}]
        namespace = {"inspect": lambda connection: self.inspector, "text": lambda sql: sql}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), "exec"), namespace)
        self.repair = namespace["repair_area_fk"]
        self.connection = Mock()
        self.connection.engine.url = SimpleNamespace(database="test_only")
        self.connection.execute.return_value.first.return_value = None

    def test_missing_fk_adds_only_constraint(self):
        self.assertTrue(self.repair(self.connection))
        statements = [call.args[0] for call in self.connection.execute.call_args_list]
        self.assertEqual(len(statements), 2)
        self.assertTrue(statements[0].startswith("SELECT "))
        self.assertEqual(statements[1],
                         "ALTER TABLE bitacoras ADD CONSTRAINT "
                         "fk_bitacoras_id_area_areas_mantenimiento "
                         "FOREIGN KEY (id_area) REFERENCES areas_mantenimiento (id_area)")

    def test_equivalent_fk_with_different_name_is_noop(self):
        self.inspector.get_foreign_keys.return_value = [{
            "name": "another_name", "constrained_columns": ["id_area"],
            "referred_table": "areas_mantenimiento", "referred_columns": ["id_area"],
        }]
        self.assertFalse(self.repair(self.connection))
        self.connection.execute.assert_not_called()

    def test_orphans_stop_before_any_alter(self):
        self.connection.execute.return_value.first.return_value = (42,)
        with self.assertRaisesRegex(RuntimeError, "áreas inexistentes"):
            self.repair(self.connection)
        self.connection.execute.assert_called_once()
        self.assertTrue(self.connection.execute.call_args.args[0].startswith("SELECT "))

    def test_missing_column_does_not_write(self):
        self.inspector.get_columns.return_value = []
        with self.assertRaisesRegex(RuntimeError, "Falta bitacoras.id_area"):
            self.repair(self.connection)
        self.connection.execute.assert_not_called()

    def test_guidance_does_not_recommend_downgrade(self):
        source = (ROOT / "scripts" / "check_schema.py").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for content in (source, readme):
            self.assertNotIn("python -m alembic downgrade", content)
            self.assertIn("python scripts/repair_area_fk.py", content)


if __name__ == "__main__":
    unittest.main()
