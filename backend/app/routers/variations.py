from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import get_current_user
from ..repositories.variations import add_variation, deactivate_variation, list_variations, update_variation
from ..schemas import VariationCreate, VariationUpdate

router = APIRouter(prefix="/product-variations", tags=["Product variations"])


@router.get("")
def get_variations(request: Request, include_inactive: bool = False, user: dict = Depends(get_current_user)):
    return {"items": list_variations(request.app.state.store, user["id"], active_only=not include_inactive)}


@router.post("", status_code=201)
def create_variation(body: VariationCreate, request: Request, user: dict = Depends(get_current_user)):
    try:
        created = add_variation(request.app.state.store, user["id"], body.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=409 if "already exists" in str(exc) else 422, detail=str(exc)) from exc
    return {"item": created}


@router.patch("/{variation_id}")
def edit_variation(variation_id: str, body: VariationUpdate, request: Request, user: dict = Depends(get_current_user)):
    try:
        changed = update_variation(request.app.state.store, user["id"], variation_id, **body.model_dump(exclude_unset=True))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"item": changed}


@router.delete("/{variation_id}")
def remove_variation(variation_id: str, request: Request, user: dict = Depends(get_current_user)):
    try:
        changed = deactivate_variation(request.app.state.store, user["id"], variation_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"item": changed, "historical_values_preserved": True}
