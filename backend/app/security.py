from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from argon2 import PasswordHasher, exceptions as argon2_exceptions

_PASSWORDS = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, hash_len=32, salt_len=16)
_TOKEN_ISSUER = "eos-pcm-local"


class TokenError(ValueError):
    pass


def hash_password(password: str) -> str:
    if len(password) < 12 or len(password) > 128:
        raise ValueError("Password must be between 12 and 128 characters.")
    return _PASSWORDS.hash(password)


def hash_legacy_password(password: str) -> str:
    """Re-hash a credential from the legacy CSV seed without changing it."""
    if not password or len(password) > 128:
        raise ValueError("Legacy password must be between 1 and 128 characters.")
    return _PASSWORDS.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _PASSWORDS.verify(password_hash, password)
    except (argon2_exceptions.VerifyMismatchError, argon2_exceptions.InvalidHashError, ValueError):
        return False


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(user: dict, secret: str, ttl_minutes: int, now: int | None = None) -> str:
    issued = int(time.time() if now is None else now)
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": _TOKEN_ISSUER,
        "sub": user["id"],
        "ver": int(user.get("token_version") or 0),
        "iat": issued,
        "exp": issued + ttl_minutes * 60,
        "jti": secrets.token_urlsafe(16),
    }
    signing_input = f"{_b64encode(json.dumps(header, separators=(',', ':')).encode())}.{_b64encode(json.dumps(payload, separators=(',', ':')).encode())}"
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64encode(signature)}"


def decode_access_token(token: str, secret: str, now: int | None = None) -> dict:
    try:
        header_part, payload_part, signature_part = token.split(".")
        signing_input = f"{header_part}.{payload_part}"
        expected = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
        supplied = _b64decode(signature_part)
        if not hmac.compare_digest(expected, supplied):
            raise TokenError("Invalid access token.")
        header = json.loads(_b64decode(header_part))
        claims = json.loads(_b64decode(payload_part))
        current = int(time.time() if now is None else now)
        if header != {"alg": "HS256", "typ": "JWT"} or claims.get("iss") != _TOKEN_ISSUER:
            raise TokenError("Invalid access token.")
        if not isinstance(claims.get("exp"), int) or claims["exp"] <= current:
            raise TokenError("Access token has expired.")
        if not isinstance(claims.get("sub"), str) or not isinstance(claims.get("ver"), int):
            raise TokenError("Invalid access token.")
        return claims
    except TokenError:
        raise
    except Exception as exc:
        raise TokenError("Invalid access token.") from exc
