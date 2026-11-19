"""HTTP permission tests using SQLite only; never imports real database/config."""
import importlib
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool


class AccessControlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = str(Path(__file__).resolve().parents[1])
        sys.path.insert(0, cls.path)
        cls.engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
        cls.sessions = sessionmaker(bind=cls.engine)
        database = ModuleType('database')
        database.Base = declarative_base()
        def get_db():
            with cls.sessions() as session:
                yield session
        database.get_db = get_db
        config = ModuleType('config')
        config.IS_PRODUCTION = False
        cls.modules = patch.dict(sys.modules, {'database': database, 'config': config})
        cls.modules.start()
        cls.auth = importlib.import_module('auth')
        cls.models = importlib.import_module('models')
        cls.client = TestClient(importlib.import_module('main').app)
        cls.base = database.Base

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        cls.engine.dispose()
        cls.modules.stop()
        sys.path.remove(cls.path)

    def setUp(self):
        self.base.metadata.drop_all(self.engine)
        self.base.metadata.create_all(self.engine)
        with self.sessions() as db:
            db.add(self.models.Usuario(username='boss', password='unused', rol='Administrador', activo=True))
            db.add(self.models.Tecnico(id_tecnico=1, nombre='Test', estado='Activo'))
            db.commit()

    def headers(self, role='Administrador', sub='boss'):
        return {'Authorization': 'Bearer ' + self.auth.create_access_token(sub, role)}

    def test_registration_requires_admin(self):
        payload = {'username': 'newboss', 'password': 'test-password-only'}
        self.assertEqual(self.client.post('/api/usuarios/', json=payload).status_code, 401)
        self.assertEqual(self.client.post('/api/usuarios/', json=payload, headers=self.headers('Tecnico', '1')).status_code, 403)
        self.assertEqual(self.client.post('/api/usuarios/', json=payload, headers=self.headers()).status_code, 200)
        with self.sessions() as db:
            user = db.query(self.models.Usuario).filter_by(username='newboss').one()
            self.assertTrue(self.auth.verify_password(payload['password'], user.password))

    def test_mobile_can_read_catalogs_but_not_admin_endpoints(self):
        headers = self.headers('Tecnico', '1')
        for path in ['/api/equipos/', '/api/piezas/', '/api/areas-mantenimiento']:
            self.assertEqual(self.client.get(path, headers=headers).status_code, 200, path)
        for path in ['/api/tecnicos/', '/api/bitacoras/', '/api/dashboard/stats', '/api/inventario/movimientos']:
            self.assertEqual(self.client.get(path, headers=headers).status_code, 403, path)
        self.assertEqual(self.client.delete('/api/equipos/999', headers=headers).status_code, 403)
        self.assertEqual(self.client.post('/api/piezas/999/entradas', json={'cantidad': 1, 'motivo': 'test'}, headers=headers).status_code, 403)

    def test_revoked_admin_token_stops_working(self):
        headers = self.headers()
        self.assertEqual(self.client.get('/api/tecnicos/', headers=headers).status_code, 200)
        with self.sessions() as db:
            db.query(self.models.Usuario).update({'activo': False})
            db.commit()
        self.assertEqual(self.client.get('/api/tecnicos/', headers=headers).status_code, 401)

    def test_changed_role_and_disabled_technician_are_rejected(self):
        admin, mobile = self.headers(), self.headers('Tecnico', '1')
        with self.sessions() as db:
            db.query(self.models.Usuario).update({'rol': 'Lectura'})
            db.query(self.models.Tecnico).update({'estado': 'Inactivo'})
            db.commit()
        self.assertEqual(self.client.get('/api/tecnicos/', headers=admin).status_code, 401)
        self.assertEqual(self.client.get('/api/piezas/', headers=mobile).status_code, 401)

    def test_invalid_token_and_unapproved_role(self):
        self.assertEqual(self.client.get('/api/tecnicos/', headers={'Authorization': 'Bearer invalid'}).status_code, 401)
        self.assertEqual(self.client.get('/api/tecnicos/', headers=self.headers('Otro')).status_code, 403)
        self.assertEqual(self.client.post('/api/usuarios/', headers=self.headers(), json={'username': 'bad', 'password': 'test', 'rol': 'Tecnico'}).status_code, 422)


if __name__ == '__main__':
    unittest.main()
