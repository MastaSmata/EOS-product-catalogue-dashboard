from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from ..dependencies import get_current_user
from ..exporting import export_products
from ..media import MediaError, MediaTooLarge
from ..repositories.variations import list_variations
from ..schemas import ProductCreate, ProductPatch, StatusUpdate

router = APIRouter(prefix="/products", tags=["Products and exports"])


def _parse_json_model(raw: str | bytes | dict, model):
    try:
        payload = raw if isinstance(raw, dict) else json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.")
        return model.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_context=False)) from exc
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc) or "Request body must be valid JSON.") from exc


async def _read_write_payload(request: Request, model):
    content_type = request.headers.get("content-type", "").lower()
    uploads: list[UploadFile] = []
    keep_ids: list[str] | None = None
    if "multipart/form-data" in content_type:
        form = await request.form()
        raw = form.get("product") or form.get("data")
        if not isinstance(raw, str):
            raise HTTPException(status_code=422, detail="Multipart requests require a JSON 'product' field.")
        parsed = _parse_json_model(raw, model)
        uploads = [item for item in form.getlist("files") if isinstance(item, UploadFile)]
        keep_raw = form.get("keep_media_ids")
        if keep_raw not in (None, ""):
            try:
                keep_ids = json.loads(str(keep_raw))
                if not isinstance(keep_ids, list) or any(not isinstance(item, str) for item in keep_ids):
                    raise ValueError
            except (json.JSONDecodeError, ValueError) as exc:
                raise HTTPException(status_code=422, detail="keep_media_ids must be a JSON array of media IDs.") from exc
        return parsed.model_dump(exclude_unset=model is ProductPatch), uploads, keep_ids
    try:
        raw = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Request body must be valid JSON.") from exc
    parsed = _parse_json_model(raw, model)
    return parsed.model_dump(exclude_unset=model is ProductPatch), uploads, keep_ids


def _decimal_query(value: Decimal | None) -> Decimal | None:
    if value is not None and (not value.is_finite() or value < 0):
        raise HTTPException(status_code=422, detail="Prices must be non-negative finite numbers.")
    return value


def _variation_query(values: list[str] | None, request: Request, user_id: str) -> dict[str, str]:
    if not values:
        return {}
    active_keys = {item["key"] for item in list_variations(request.app.state.store, user_id, active_only=True)}
    filters: dict[str, str] = {}
    for item in values:
        key, separator, value = item.partition("=")
        if not separator or not key or key not in active_keys:
            raise HTTPException(status_code=422, detail="Variation filters must use an active variation key and key=value format.")
        filters[key] = value
    return filters


def _list_products(request: Request, user_id: str, *, q: str = "", category: str | None = None,
                   status: str | None = None, stock: str | None = None, low_stock: bool | None = None,
                   min_price: Decimal | None = None, max_price: Decimal | None = None,
                   sort: str = "name", direction: str = "asc", include_deleted: bool = False,
                   variation_filters: dict[str, str] | None = None):
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=422, detail="Minimum price cannot exceed maximum price.")
    try:
        return request.app.state.products.list(
            user_id, q=q, category=category, status=status, stock=stock, low_stock=low_stock,
            min_price=_decimal_query(min_price), max_price=_decimal_query(max_price), sort=sort,
            direction=direction, include_deleted=include_deleted, variation_filters=variation_filters,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/export")
def export_user_products(
    request: Request,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    q: str = "", category: str | None = None, status: str | None = None, stock: str | None = None,
    low_stock: bool | None = None, min_price: Decimal | None = None, max_price: Decimal | None = None,
    sort: str = "name", direction: str = Query("asc", pattern="^(asc|desc)$"),
    variation: list[str] | None = Query(default=None), ids: list[str] | None = Query(default=None), user: dict = Depends(get_current_user),
):
    variation_filters = _variation_query(variation, request, user["id"])
    result = _list_products(request, user["id"], q=q, category=category, status=status, stock=stock,
                            low_stock=low_stock, min_price=min_price, max_price=max_price, sort=sort, direction=direction,
                            variation_filters=variation_filters)
    items = result["items"]
    if ids is not None:
        selected = set(ids)
        items = [product for product in items if product["id"] in selected]
    definitions = list_variations(request.app.state.store, user["id"], active_only=True)
    try:
        file = export_products(items, definitions, format)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(
        content=file.body,
        media_type=file.media_type,
        headers={"Content-Disposition": f'attachment; filename="{file.filename}"', "Cache-Control": "no-store"},
    )


@router.get("")
def list_products(
    request: Request,
    q: str = "", category: str | None = None,
    status: str | None = Query(default=None, pattern="^(draft|active|archived)$"),
    stock: str | None = Query(default=None, pattern="^(out|low|in)$"),
    low_stock: bool | None = None,
    min_price: Decimal | None = Query(default=None, ge=0), max_price: Decimal | None = Query(default=None, ge=0),
    sort: str = "name", direction: str = Query("asc", pattern="^(asc|desc)$"),
    include_deleted: bool = False, user: dict = Depends(get_current_user),
    variation: list[str] | None = Query(default=None),
):
    variation_filters = _variation_query(variation, request, user["id"])
    return _list_products(request, user["id"], q=q, category=category, status=status, stock=stock,
                          low_stock=low_stock, min_price=min_price, max_price=max_price,
                          sort=sort, direction=direction, include_deleted=include_deleted,
                          variation_filters=variation_filters)


@router.post("", status_code=201)
async def create_product(request: Request, user: dict = Depends(get_current_user)):
    data, uploads, _keep_ids = await _read_write_payload(request, ProductCreate)
    try:
        saved = await request.app.state.products.create(user, data, uploads)
    except MediaTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except MediaError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="The product could not be saved. No success was recorded.") from exc
    return saved


@router.get("/{product_id}")
def get_product(product_id: str, request: Request, user: dict = Depends(get_current_user)):
    product = request.app.state.products.get(user["id"], product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


@router.patch("/{product_id}")
async def update_product(product_id: str, request: Request, user: dict = Depends(get_current_user)):
    data, uploads, keep_ids = await _read_write_payload(request, ProductPatch)
    try:
        product = await request.app.state.products.update(user, product_id, data, uploads, keep_ids)
    except MediaTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except MediaError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


@router.patch("/{product_id}/status")
def change_product_status(product_id: str, body: StatusUpdate, request: Request, user: dict = Depends(get_current_user)):
    product = request.app.state.products.set_status(user["id"], product_id, body.status)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


@router.delete("/{product_id}")
def delete_product(product_id: str, request: Request, user: dict = Depends(get_current_user)):
    product = request.app.state.products.soft_delete(user["id"], product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return {"product": product, "deleted": True, "deletion_mode": "soft"}


@router.get("/{product_id}/media/{media_id}")
def get_product_media(product_id: str, media_id: str, request: Request,
                      u: str = Query(..., min_length=1), exp: int = Query(...), sig: str = Query(..., min_length=64, max_length=64)):
    manager = request.app.state.media
    if not manager.verify_signed_url(u, product_id, media_id, exp, sig):
        raise HTTPException(status_code=403, detail="Media link is invalid or expired.")
    metadata = request.app.state.products.get_media_metadata(u, product_id, media_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Media not found.")
    try:
        path = manager.path_for(metadata["path"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Media not found.") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media file is missing.")
    name = Path(metadata.get("filename") or "product-media").name
    return FileResponse(path, media_type=metadata.get("content_type") or "application/octet-stream", filename=name,
                        content_disposition_type="inline", headers={"Cache-Control": "private, max-age=60"})
