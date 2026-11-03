from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .repositories.users import user_by_id
from .security import TokenError, decode_access_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = decode_access_token(credentials.credentials, request.app.state.settings.jwt_secret)
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc
    user = user_by_id(request.app.state.store, claims["sub"])
    if not user or int(user.get("token_version") or "0") != claims["ver"]:
        raise HTTPException(status_code=401, detail="This session has expired. Sign in again.", headers={"WWW-Authenticate": "Bearer"})
    return user
