"""Authentication helpers for the web dashboard."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import IS_PRODUCTION
from database import get_db
from sqlalchemy.orm import Session
import models


def validate_token_secret_at_startup() -> None:
    """Fail fast on startup if the token secret is missing or unsafe.

    `_token_secret()` only runs lazily when a token is created/verified, so a
    missing or weak secret in production would otherwise go unnoticed until
    the first login attempt. Calling this during app startup surfaces the
    error immediately instead of a confusing runtime failure.
    """
    _token_secret()


def _token_secret() -> bytes:
    secret = os.getenv("CAMPOTERRA_TOKEN_SECRET", "").strip()
    if not secret:
        if IS_PRODUCTION:
            raise RuntimeError(
                "CAMPOTERRA_TOKEN_SECRET debe estar configurada en producción."
            )
        # Development remains usable without silently introducing a production secret.
        secret = "development-" + secrets.token_urlsafe(32)
        os.environ["CAMPOTERRA_TOKEN_SECRET"] = secret
    if IS_PRODUCTION:
        normalized_secret = secret.casefold()
        placeholders = (
            "replace",
            "change-me",
            "changeme",
            "your-secret",
            "your_secret",
            "placeholder",
            "example",
            "set-me",
            "password",
            "default",
            "development",
            "dummy",
            "sample",
            "123456",
            "qwerty",
        )
        if (
            len(secret) < 32
            or len(set(secret)) < 8
            or any(marker in normalized_secret for marker in placeholders)
        ):
            raise RuntimeError(
                "CAMPOTERRA_TOKEN_SECRET debe ser aleatorio, no ser un placeholder "
                "y tener al menos 32 caracteres en producción."
            )

    return secret.encode("utf-8")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)
    return "pbkdf2_sha256$600000${}${}".format(
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored_password: str) -> bool:
    if not stored_password or not stored_password.startswith("pbkdf2_sha256$"):
        # Allows one-time migration of legacy records; new records are always hashed.
        return hmac.compare_digest(password, stored_password or "")

    try:
        _, iterations_text, salt_text, digest_text = stored_password.split("$", 3)
        iterations = int(iterations_text)
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
    except (ValueError, UnicodeError):
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(actual, expected)


def create_access_token(username: str, role: str, expires_in: int = 8 * 60 * 60) -> str:
    payload = {
        "sub": username,
        "role": role,
        "exp": int(time.time()) + expires_in,
    }
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=")
    signature = hmac.new(
        _token_secret(), encoded_payload, hashlib.sha256
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=")
    return f"{encoded_payload.decode('ascii')}.{encoded_signature.decode('ascii')}"


def _decode_token(token: str) -> dict:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected_signature = hmac.new(
            _token_secret(), encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        actual_signature = base64.urlsafe_b64decode(
            encoded_signature + "=" * (-len(encoded_signature) % 4)
        )
        if not hmac.compare_digest(actual_signature, expected_signature):
            raise ValueError
        payload = json.loads(
            base64.urlsafe_b64decode(
                encoded_payload + "=" * (-len(encoded_payload) % 4)
            ).decode("utf-8")
        )
        if not payload.get("sub") or int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError
        return payload
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


bearer_scheme = HTTPBearer(auto_error=False)


def require_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere autenticación Bearer",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials)


def require_active_user(
    user: dict = Depends(require_token),
    db: Session = Depends(get_db),
) -> dict:
    """Check current account state, not just the role saved in a token."""
    if user.get("role") == "Tecnico":
        if not str(user["sub"]).isdigit():
            raise HTTPException(status_code=401, detail="Sesión móvil inválida")
        account = db.query(models.Tecnico).filter(
            models.Tecnico.id_tecnico == int(user["sub"]),
            models.Tecnico.estado == "Activo",
        ).first()
    elif user.get("role") == "Administrador":
        account = db.query(models.Usuario).filter(
            models.Usuario.username == user["sub"],
            models.Usuario.activo.is_(True),
            models.Usuario.rol == "Administrador",
        ).first()
    else:
        raise HTTPException(status_code=403, detail="Rol sin acceso al sistema")
    if not account:
        raise HTTPException(status_code=401, detail="Cuenta inactiva o permisos revocados")
    return user


def require_dashboard_user(user: dict = Depends(require_active_user)) -> dict:
    if user.get("role") != "Administrador":
        raise HTTPException(status_code=403, detail="Acceso exclusivo del encargado")
    return user


def require_mobile_user(user: dict = Depends(require_active_user)) -> dict:
    if user.get("role") != "Tecnico":
        raise HTTPException(status_code=403, detail="Se requiere una sesión de técnico")
    return user
