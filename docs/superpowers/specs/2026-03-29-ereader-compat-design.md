# E-Reader Compatibility & Verso Sync Plugin — Design Spec

## Overview

Three changes to make e-reader sync actually work with real KOReader devices:

1. **App password** — replaces API keys. Single password per user for all external auth (OPDS, kosync, KoInsight). Stores bcrypt + MD5 hashes.
2. **Protocol compatibility fixes** — fix KoInsight validators/routes to match real plugin payloads, switch kosync auth to MD5(app password), switch OPDS to app password.
3. **Verso Sync plugin** — stripped-down KoInsight fork for KOReader with Basic auth. Lives in `packages/koreader-plugin/`.

## Resolved Decisions

| Decision | Resolution |
|----------|-----------|
| Auth mechanism | App password (not API keys). User sets once in Verso Settings. |
| OIDC users | Must set app password in Settings to use external sync. |
| Multiple app passwords | No. One per user. |
| Existing API key system | Removed entirely. App password replaces it. |
| KoInsight fork scope | Stripped down, renamed "Verso Sync". Basic auth added. |
| Plugin self-download endpoint | Removed. Users copy plugin manually. |
| kosync auth | MD5(app password) compared against stored `appPasswordMd5`. No kosync plugin fork needed. |

---

## Part 1: App Password

### Schema

Add to `users` table:
```
appPasswordHash  text    — bcrypt hash, nullable
appPasswordMd5   text    — MD5 hex hash (for kosync protocol), nullable
```

Remove the `apiKeys` table entirely.

### Setting the Password

New tRPC router `appPassword`:
- `appPassword.set({ password: string })` — validates min length (8), computes `bcrypt(password)` and `MD5(password)`, stores both on the user record. Returns `{ success: true }`.
- `appPassword.clear()` — sets both fields to null. Returns `{ success: true }`.
- `appPassword.status()` — returns `{ hasPassword: boolean }`.

### Removing API Keys

Delete:
- `apiKeys` table from schema
- `packages/shared/src/schemas/api-keys.ts` (validators)
- `packages/server/src/services/api-keys.ts` (service)
- `packages/server/src/trpc/routers/api-keys.ts` (router)
- API keys reference from `packages/server/src/trpc/router.ts`
- API key tests
- Any frontend components for API key management

Generate migration to drop `api_keys` table and add app password columns to `users`.

---

## Part 2: Auth Middleware Changes

### kosync Auth (MD5 comparison)

Rewrite `createKosyncAuthHook`:
1. Read `x-auth-user` (email) and `x-auth-key` (MD5 hex) headers
2. Look up user by email
3. Compare `x-auth-key` against `users.appPasswordMd5` (direct string comparison — KOReader already sent the MD5)
4. If match: set `req.user`, proceed
5. If no match or no app password set: 401

### OPDS Auth (bcrypt comparison)

Rewrite `createBasicAuthHook` (or create new `createAppPasswordAuthHook`):
1. Decode Basic auth header → email + password
2. Look up user by email
3. First try: compare password against `users.appPasswordHash` via bcrypt
4. Fallback: compare against `users.passwordHash` (login password) for non-OIDC users who haven't set an app password yet
5. If match: set `req.user`, proceed
6. If no match: 401

The fallback to login password keeps existing OPDS setups working. Once a user sets an app password, both work.

### KoInsight Auth (same as OPDS)

KoInsight routes use the same `createAppPasswordAuthHook`. The Verso Sync plugin sends Basic auth with email + app password.

### Summary of Auth Hooks After Changes

| Hook | Used by | Validates |
|------|---------|-----------|
| `createKosyncAuthHook` | kosync routes | `x-auth-key` header vs `appPasswordMd5` |
| `createAppPasswordAuthHook` | OPDS, KoInsight routes | Basic auth vs `appPasswordHash` (fallback to `passwordHash`) |
| `createAuthHook` | tRPC (web app) | Bearer JWT — unchanged |
| `createAdminAuthHook` | Upload route | Bearer JWT + admin role — unchanged |

---

## Part 3: KoInsight Protocol Fixes

### Validator Changes

**`koinsightStatInput`:**
- Rename `md5` → `book_md5` (what plugin actually sends)
- Add optional `device_id` per stat entry

**`koinsightImportInput`:**
- `device_id` becomes optional (only in annotation-only sync path)

**`koinsightAnnotationInput`:**
- `page` changes from `z.number().int()` to `z.union([z.number(), z.string()])` (PDF pages are numbers, EPUB positions are xPointer strings)
- Add extra fields plugin sends: `datetime`, `color`, `drawer`, `pageno`, `pos0`, `pos1`, `total_pages`, `datetime_updated` (all optional)

**`koinsightBookInput`:**
- Add extra fields: `id`, `notes`, `last_open`, `highlights`, `series`, `language`, `total_read_time`, `total_read_pages` (all optional)

### Schema Change

`annotations.pageNumber`: change from `integer` to `text` to support EPUB xPointer strings.

### Route Changes

**Import handler (`koinsight.ts`):**
- Use `stat.book_md5` everywhere (was `stat.md5`)
- Resolve `device_id` from body, or from first stat entry's `device_id`, or skip device verification if absent
- Store annotation `pageNumber` as text
- Handle no `device_id`: skip device ownership check, set `deviceId: null` on created records

**Remove `/api/plugin/download` endpoint** — no longer needed.

### Route Changes for `annotations.pageNumber`

Since `pageNumber` becomes text, the annotation insert in the import handler stores it as `String(ann.page)` regardless of whether it's a number or xPointer string.

---

## Part 4: Verso Sync KOReader Plugin

### Location

`packages/koreader-plugin/versosync.koplugin/`

### Files (based on KoInsight structure)

| File | Purpose | Changes from KoInsight |
|------|---------|----------------------|
| `_meta.lua` | Plugin metadata | Rename to "Verso Sync" |
| `const.lua` | Version constant | Keep `0.3.0` |
| `main.lua` | Entry point, menu, lifecycle | Replace settings UI: server URL + email + password. Same sync triggers. |
| `settings.lua` | Settings persistence | Add `email` and `password` fields |
| `call_api.lua` | HTTP client | Add `Authorization: Basic base64(email:password)` header to all requests |
| `upload.lua` | Sync orchestration | No changes to payload format — same endpoints, same data |
| `db_reader.lua` | SQLite stats reader | No changes |
| `annotation_reader.lua` | Annotation extraction | No changes |

### Settings UI

Menu under Tools > Verso Sync:
- "Synchronize data" — manual full sync
- "Sync on suspend" — toggle
- "Set server URL" — text input
- "Set credentials" — email + password input (MultiInputDialog with 2 fields)
- "About" — version info

Remove: aggressive suspend sync (unnecessary complexity), suspend connect timeout (use default), plugin download.

### Auth in HTTP Requests

In `call_api.lua`, add to every request:
```lua
headers["Authorization"] = "Basic " .. require("ffi/util").base64_encode(email .. ":" .. password)
```

The email and password are read from `KoInsightSettings` (renamed to `VersoSyncSettings`).

Note: KOReader's LuaSocket may or may not have base64 built in. If not, use a simple Lua base64 implementation (common in KOReader plugins).

### Installation

Users copy `versosync.koplugin/` to their KOReader's `plugins/` directory. Document in Verso's deployment guide.

---

## Migration Summary

### Schema Changes
- Add `appPasswordHash` (text, nullable) and `appPasswordMd5` (text, nullable) to `users`
- Drop `api_keys` table
- Change `annotations.pageNumber` from `integer` to `text`

### Files to Delete
- `packages/shared/src/schemas/api-keys.ts`
- `packages/server/src/services/api-keys.ts`
- `packages/server/src/trpc/routers/api-keys.ts`
- `packages/server/src/__tests__/api-keys.test.ts`
- Related frontend API key management components

### Files to Create
- `packages/server/src/trpc/routers/app-password.ts`
- `packages/shared/src/app-password-validators.ts`
- `packages/koreader-plugin/versosync.koplugin/` (8 Lua files)

### Files to Modify
- `packages/shared/src/schema.ts` — users table + drop apiKeys + annotations.pageNumber
- `packages/shared/src/koinsight-validators.ts` — protocol fixes
- `packages/server/src/routes/koinsight.ts` — protocol fixes + remove download endpoint
- `packages/server/src/routes/opds.ts` — use app password auth
- `packages/server/src/middleware/kosync-auth.ts` — MD5 comparison
- `packages/server/src/middleware/basic-auth.ts` — app password support
- `packages/server/src/trpc/router.ts` — swap apiKeys → appPassword
- `packages/shared/src/index.ts` — exports
- `packages/server/src/app.ts` — if needed

---

## Implementation Order

1. App password schema + service + router (foundation)
2. Auth middleware rewrites (kosync, OPDS, KoInsight)
3. Remove API key system
4. KoInsight protocol fixes (validators + routes)
5. Verso Sync KOReader plugin (Lua files)
6. Tests + integration verification
