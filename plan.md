# EOS PCM implementation plan

## Product and implementation

Extend the approved Vite single-page EOS PCM application with a real **local-testing** FastAPI backend and replace the browser mock repository as the product source of truth. Keep the frontend stack semantic HTML, CSS, modular Vanilla JavaScript ES modules and Vite. Use Python 3.12, FastAPI/Pydantic, JSON request/response contracts except multipart uploads, CSV persistence, local media storage, Pillow with AVIF support, FFmpeg for WebM transcoding, Argon2 password hashing, signed expiring JWT bearer tokens, FastAPI Swagger/OpenAPI, and openpyxl for genuine XLSX exports. Do not enable or connect a live database server and do not use an in-memory collection as primary persistence.

The frontend calls relative `/api/v1/...` URLs through a Vite development proxy to FastAPI on `127.0.0.1:8000`; Vite continues to serve the user-facing project on its configured port 3000. Run FastAPI as a separate Sandbox service for this local-testing Preview. Product, account, variation, sequence, and issued-SKU data live in CSV files under an ignored `backend/data/` directory; processed media lives under an ignored user-specific filesystem tree. These files persist across API restarts in the Sandbox, but the endpoint/service and local files are not published as durable production infrastructure. Document the local-only boundary clearly; the WebDev-managed site stays unpublished.

Use a repository boundary so an eventual SQL-backed repository can replace CSV storage without changing the HTTP contract or UI. The CSV adapter uses a process-wide file lock, validated read/modify/write transactions, temporary files, `fsync`, and atomic replace. Initialize every CSV header on first run. A persistent category sequence registry and issued-SKU ledger reserve identifiers under lock; sequences and SKUs are never reused, including after soft deletion or a later failed creation. Keep user-owned records scoped on every route.

The canonical product schema is shared by API serialization, CSV columns, exports, the frontend form schema and Database columns. Preserve the required standard names and capitalization: `sku`, `name`, `slug`, `description`, `short_description`, `category`, `brand`, `cost_price`, `selling_price`, `Color`, `Size`, `currency`, `status`, `track_inventory`, `stock_quantity`, `weight`, `weight_unit`, `created_at`, `updated_at`, `deleted_at`, plus internal ID/owner, tags, low-stock threshold, media metadata, and a JSON map for custom variation values. Money uses Python `Decimal` and exact fixed-point CSV/JSON representations; timestamps are timezone-aware ISO 8601 UTC. Generate unique slugs from name. Never expose SKU, slug, timestamps, ownership IDs, or other system fields as ordinary editable form controls. Map backend `active`/`draft`/`archived` status and stock tracking to the existing explicit Catalogue status/inventory presentation without losing backend field names.

Implement JSON CRUD under `/api/v1/products`, server-generated `ccc-nnnn-xxx` SKUs, status changes, soft deletion, per-user filtered list/detail, and authenticated media retrieval. Category remains nullable as specified. Prefixes use the first three normalized alphabetic characters, lowercased; categories with fewer than three alphabetic characters are padded with `x`, while an empty/non-alphabetic category uses prefix `cat` and its own persistent sequence. Sequence by normalized full category, pad to at least four digits without a 9,999 ceiling, generate the suffix with `secrets`, and check the complete SKU against all previously issued identifiers while holding the CSV lock. Reject/ignore client SKU edits.

Add account registration/login/logout, current profile read/update, currency preference, password change, and user-scoped product variation operations. Store only Argon2 password hashes. Tokens are expiring signed bearer JWTs held in per-tab `sessionStorage` by the local front end; logout invalidates the user token version. Registration is open for local testing, with no email-verification claim. Default currency is NGN; a validated configurable allow-list includes international and African currencies. Currency selection sets new-product defaults and frontend display formatting; do not convert exchange rates.

Each user receives default `Color` and `Size` variations. Add, rename, and remove operations maintain stable IDs, validated display names and safe unique internal keys, text type, active state, and timestamps. Reserved/system keys cannot be created. Removing a definition deactivates it from new/edit forms and Database columns but preserves historical values in the product CSV; permanent historical-value destruction is not silently performed. Store dynamic values as validated JSON in each CSV product row and return definitions and values through the API.

Process up to three uploaded files per product. Validate actual decoded formats/size and treat client filenames as untrusted. Convert images to AVIF and videos to WebM with FFmpeg using generated SKU-based filenames under `uploads/users/<user_id>/images|videos/`. Keep media private: product JSON contains relative authorized API URLs and media endpoints verify authentication, ownership, and media-to-product linkage. Process into temporary files, write product CSV only when processing succeeds, and remove failed temporary outputs; delete replaced/removed files only after the product save commits. Document chosen bounded upload/video limits. Do not expose the upload directory as public static content.

The existing Catalogue and Database views, shared schema-driven form, profile/settings menu, metrics, selection, filters, sorting, and row actions consume one authenticated store hydrated from `/auth/me`, active variations, and `/products`. The API response is authoritative: show pending/saving/error states, preserve retryable form values, never generate a SKU in the browser, and refresh products/definitions after successful server mutations. Keep Catalogue and Database views on the same records. Extend account settings for login/profile/password, currency, and product-variation management. Add custom variation form fields, searchable values, and dynamic Database columns without source changes. Keep historical legacy fields such as tags and media, and existing low-stock/stock thresholds, in the shared schema.

CSV and XLSX exports call authenticated backend endpoints, apply all requested search/category/status/stock/price/custom-variation filters, exclude soft-deleted records by default, include all eligible user records for “all”, selected IDs for “selected”, standard fields and active custom variation columns, and return correctly typed downloadable files with the correct content headers. Keep media as references rather than embedded binaries. Do not treat a front-end-generated file as a successful backend export.

Preserve the previously approved restrained, responsive Groundtaq visual system and the Catalogue/Database workflows; add a secure-looking login/register gate and account settings without claiming production identity verification. Because no sales-ingestion API is specified, sales history is not fabricated during backend onboarding; display zero/insufficient-history states until authoritative sales are supplied, and keep this limitation explicit.

## Project structure

- `index.html`, `vite.config.js`, `package.json`, `pnpm-lock.yaml`: Vite entry, repeatable frontend toolchain, and `/api` development proxy to FastAPI.
- `public/manus-routes.json`: the single `/` application route (API paths are not page routes).
- `src/main.js`: app bootstrap, auth gate, view rendering, delegated UI actions, API error/toast behavior, and form/export/settings wiring.
- `src/api/`: authenticated fetch/download helpers, token/session management, and API client errors.
- `src/state/store.js`: one async backend-hydrated product/UI/account/variation state; no localStorage product repository.
- `src/data/product-schema.js`: canonical standard field definitions plus dynamic variation fields shared by forms/grid/export presentation.
- `src/services/`: backend repository client and media preview lifecycle; remove demo-mock CRUD/export as source of truth.
- `src/components/` and `src/views/`: existing Catalogue/Database/form/header components, updated for API fields, login/register, account/currency/variation settings, and dynamic fields.
- `src/utils/`: safe DOM, input validation, status/stock/currency/date formatting, querying and sorting keyed by the canonical schema.
- `src/styles/`: existing design system, plus auth/settings states while preserving responsive layouts.
- `backend/app/main.py`: FastAPI application factory, API routers, health and Swagger/OpenAPI.
- `backend/app/config.py`: environment-driven paths, currency allow-list, size/duration limits, JWT key/expiry.
- `backend/app/schemas.py`: Pydantic request/response contracts for the shared product schema, accounts, media, variations, and filters.
- `backend/app/storage.py`: locked atomic CSV repository primitives, initialization, and persistent tables.
- `backend/app/repositories/`: account, product, variation and SKU-sequence operations behind API-independent interfaces.
- `backend/app/security.py`: Argon2 hashing, bearer JWT issuance/verification, token-version logout invalidation.
- `backend/app/media.py`: bounded upload validation, AVIF/WebM conversion, safe per-user file lifecycle, and authorized lookup.
- `backend/app/routers/`: auth/account, products/media, variations, and CSV/XLSX export endpoints.
- `backend/tests/`: isolated pytest coverage using temporary CSV/media directories and FastAPI TestClient, including restart, ownership, concurrency, media, variations and exports.
- `backend/requirements.txt`, root `.env.example`, `.gitignore`, `README.md`, `TODO.md`: pinned Python dependencies, secret/path configuration template, ignored local data, local run/API docs, and full acceptance outcomes.

## Design direction

- **Design movement:** contemporary Swiss editorial design for a compact merchant operations tool.
- **Core principles:** precise alignment; high information density without cramped text; product-first recognition; calm, explicit status/action language.
- **Color philosophy:** warm off-white canvas and paper-like surfaces keep long sessions comfortable; deep forest/teal is the signature action hue and nods to Groundtaq without claiming a merchant identity; near-black ink anchors data; muted sage/amber/coral communicate status consistently and always with text labels.
- **Layout paradigm:** a slim, persistent workspace rail/header anchors a wide operational canvas; metrics form a compact horizontal strip, while search/actions occupy one toolbar band and product content gets the page width. The database uses a genuinely horizontal sheet with sticky row and column headers rather than shrinking the schema.
- **Signature elements:** a small geometric ground/leaf glyph as the configurable Groundtaq placeholder mark; column letters and row indices styled like a restrained data instrument; compact status lozenges and monospaced SKU/price metadata.
- **Interaction philosophy:** actions are contextual but deliberate; selection is visibly separate from row actions, state changes require an intentional control, and destructive changes state their impact and ask for confirmation. Keyboard and touch users receive equivalent controls.
- **Animation:** minimal 140–180 ms transitions for popovers, drawers, and hover/focus feedback; no attention-grabbing motion; respect `prefers-reduced-motion`.
- **Typography system:** an Inter-like neutral sans-serif stack for application UI, with a system monospace stack for SKUs, spreadsheet coordinates, and numeric alignment; clear 12/14/16/20/28 px hierarchy and tabular numerals for prices and metrics.
- **Brand essence:** a dependable, focused workspace for merchants to understand and maintain their product catalogue; personality: precise, calm, capable.
- **Brand voice:** concise, operational, and explicit. Example lines: “No products match these filters.” and “3 products selected”.
- **Wordmark/logo:** configurable merchant wordmark and logo URL; when absent, show a small custom geometric Groundtaq-inspired placeholder mark without inventing a permanent merchant identity.
- **Signature brand color:** deep ground-teal, used selectively for primary actions, active navigation, and focus accents.

## Constraints and serving

The FastAPI backend and CSV/media files are for local testing only. No live database server, public production backend, cloud storage, exchange-rate conversion, external catalog publishing, email verification, or sales-ingestion pipeline is included. The Vite Preview reaches the local API through a same-origin `/api` proxy; run the FastAPI service alongside Vite. If the sandbox sleeps/stops, restart the API using README instructions; CSV/media files remain local to the sandbox but are not an archival/production durability guarantee. Set a strong uncommitted JWT secret in `.env`; never return it to the browser or commit it. Client-side validation remains convenience, not security. Do not publish this change; retain the existing project publication setting.
