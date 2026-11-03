from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import get_current_user
from ..repositories.users import create_user, invalidate_tokens, public_user, replace_email, replace_password, update_user, validate_user
from ..schemas import EmailChange, LoginRequest, PasswordChange, ProfileUpdate, RegisterRequest, TokenResponse
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication and account"])


def _token_response(request: Request, user: dict) -> TokenResponse:
    settings = request.app.state.settings
    token = create_access_token(user, settings.jwt_secret, settings.token_ttl_minutes)
    return TokenResponse(access_token=token, expires_in=settings.token_ttl_minutes * 60, user=public_user(user))


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, request: Request):
    settings = request.app.state.settings
    if body.email.strip().lower() in {row["email"].lower() for row in request.app.state.store.read("users")}:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    try:
        password_hash = hash_password(body.password)
        user = create_user(request.app.state.store, body.email, body.display_name, password_hash, "NGN")
    except ValueError as exc:
        raise HTTPException(status_code=409 if "already exists" in str(exc) else 422, detail=str(exc)) from exc
    return _token_response(request, user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request):
    user = validate_user(request.app.state.store, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.", headers={"WWW-Authenticate": "Bearer"})
    return _token_response(request, user)


@router.get("/me")
def get_me(request: Request, user: dict = Depends(get_current_user)):
    return {"user": public_user(user), "available_currencies": list(request.app.state.settings.allowed_currencies)}


@router.patch("/profile")
def update_profile(body: ProfileUpdate, request: Request, user: dict = Depends(get_current_user)):
    data = body.model_dump(exclude_unset=True)
    if "preferred_currency" in data and data["preferred_currency"] not in request.app.state.settings.allowed_currencies:
        raise HTTPException(status_code=422, detail="Choose a currency from the configured ISO currency list.")
    if data.get("display_name") is not None and not data["display_name"].strip():
        raise HTTPException(status_code=422, detail="Display name cannot be blank.")
    try:
        changed = update_user(request.app.state.store, user["id"], **data)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"user": public_user(changed), "available_currencies": list(request.app.state.settings.allowed_currencies)}


@router.post("/email", response_model=TokenResponse)
def change_email(body: EmailChange, request: Request, user: dict = Depends(get_current_user)):
    if not verify_password(user["password_hash"], body.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    try:
        changed = replace_email(request.app.state.store, user["id"], body.new_email)
    except ValueError as exc:
        raise HTTPException(status_code=409 if "already exists" in str(exc) else 422, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    # Email changes invalidate existing access tokens; issue a fresh token for the current session.
    return _token_response(request, changed)


@router.post("/password", response_model=TokenResponse)
def change_password(body: PasswordChange, request: Request, user: dict = Depends(get_current_user)):
    if not verify_password(user["password_hash"], body.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    try:
        changed = replace_password(request.app.state.store, user["id"], hash_password(body.new_password))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _token_response(request, changed)


@router.post("/logout")
def logout(request: Request, user: dict = Depends(get_current_user)):
    invalidate_tokens(request.app.state.store, user["id"])
    return {"ok": True, "message": "Signed out. Existing access tokens have been invalidated."}
