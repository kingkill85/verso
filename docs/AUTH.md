# Authentication

Verso supports three authentication methods that all produce the same internal JWT tokens.

## Auth Modes

Configured via `AUTH_MODE` environment variable:

| Mode | Description |
|------|-------------|
| `local` | Email/password only. OIDC endpoints are disabled. |
| `oidc` | OIDC only. Registration and password login are disabled. |
| `both` | Both methods available. Users can link OIDC to local accounts. Default. |

## JWT Tokens

All authenticated requests use JWT bearer tokens in the `Authorization` header.

### Access Token
- **Lifetime**: 15 minutes (configurable via `JWT_ACCESS_EXPIRES`)
- **Payload**: `{ sub: userId, email, role, type: 'access' }`
- **Signed with**: `JWT_SECRET` using HS256
- **Usage**: Sent with every API request in `Authorization: Bearer <token>` header

### Refresh Token
- **Lifetime**: 7 days (configurable via `JWT_REFRESH_EXPIRES`)
- **Payload**: `{ sub: userId, sessionId, type: 'refresh' }`
- **Storage**: Hash stored in `sessions` table (server-side)
- **Usage**: Used only to obtain new access + refresh token pair
- **Rotation**: Each refresh issues a new refresh token and invalidates the old one

### Token Flow
```
Login/OIDC → { accessToken (15m), refreshToken (7d) }
  ↓
API requests use accessToken
  ↓
accessToken expires → client calls auth.refresh with refreshToken
  → new { accessToken, refreshToken }
  → old refreshToken is invalidated
  ↓
refreshToken expires → user must re-authenticate
```

## Local Authentication

### Registration

1. User submits email, password, display name
2. Server validates email uniqueness
3. Password hashed with bcrypt (cost factor 12)
4. User record created
5. Three default shelves created for the new user
6. JWT pair issued

**Password requirements**: Minimum 8 characters. No other restrictions — complexity requirements don't improve security and frustrate users.

### Login

1. User submits email + password
2. Server looks up user by email
3. bcrypt.compare against stored hash
4. If valid, create session record, issue JWT pair
5. Update `last_login_at`

### First-Run Setup

On first launch (no users in DB), the app redirects to `/setup`:
1. User creates admin account (email, password, display name)
2. Admin can then invite other users or enable OIDC

## OIDC Authentication

Designed for integration with self-hosted identity providers, primarily Authentik.

### Configuration

```env
OIDC_ISSUER=https://auth.example.com/application/o/verso/
OIDC_CLIENT_ID=verso
OIDC_CLIENT_SECRET=your-secret-here
OIDC_REDIRECT_URI=https://books.example.com/auth/callback
OIDC_SCOPES=openid profile email
OIDC_AUTO_REGISTER=true
OIDC_DEFAULT_ROLE=user
```

The server uses `openid-client` to discover the OIDC provider configuration from `{OIDC_ISSUER}/.well-known/openid-configuration` at startup.

### Authentik Setup

In Authentik, create an OAuth2/OpenID Provider:
1. **Name**: Verso
2. **Authorization flow**: default-provider-authorization-implicit-consent
3. **Client type**: Confidential
4. **Client ID**: verso (auto-generated or custom)
5. **Redirect URIs**: `https://books.example.com/auth/callback`
6. **Scopes**: openid, profile, email
7. **Subject mode**: Based on user ID
8. Create an Application linked to this provider

### OIDC Flow

```
1. Frontend calls trpc.auth.getOIDCAuthUrl.query()
   Server generates:
   - state (random, stored in short-lived cache)
   - nonce (random, stored alongside state)
   - PKCE code_verifier + code_challenge
   Returns authorization URL

2. Frontend redirects user to OIDC provider
   URL: {issuer}/authorize?
     client_id=verso&
     redirect_uri=.../auth/callback&
     response_type=code&
     scope=openid+profile+email&
     state={state}&
     nonce={nonce}&
     code_challenge={challenge}&
     code_challenge_method=S256

3. User authenticates at provider (Authentik login page)

4. Provider redirects to GET /auth/callback?code=xxx&state=yyy

5. Server validates:
   - state matches stored state
   - Exchanges code for tokens (with PKCE code_verifier)
   - Validates ID token:
     - Signature (using provider's JWKS)
     - iss matches OIDC_ISSUER
     - aud contains OIDC_CLIENT_ID
     - nonce matches stored nonce
     - exp not passed
   - Extracts claims: sub, email, name, picture

6. Server finds or creates user:
   - Look up by (oidc_provider, oidc_subject)
   - If found → existing user, update last_login_at
   - If not found and OIDC_AUTO_REGISTER=true:
     → Create user from claims, role = OIDC_DEFAULT_ROLE
     → Create default shelves
   - If not found and OIDC_AUTO_REGISTER=false:
     → Return error "Account not found. Contact admin."

7. Issue Verso JWT pair, create session

8. Redirect to frontend: /#/auth/complete?session={sessionId}
   Frontend picks up session and stores tokens
```

### Account Linking

Users with local accounts can link their OIDC identity:
1. User logs in with local credentials
2. Navigates to Settings → Account → Link SSO
3. Initiates OIDC flow (same as above)
4. Instead of creating a new user, links `oidc_provider` + `oidc_subject` to existing user

Users can unlink OIDC only if they have a local password set (so they don't lock themselves out).

## App Passwords (API Keys)

For OPDS clients and external tools that can't do browser-based auth.

### Creation
1. User goes to Settings → API Keys → Create
2. Enters a name (e.g., "KOReader on tablet")
3. Selects scopes: `opds`, `api`
4. Optional: set expiry date
5. Server generates a random key: `vso_xxxxxxxxxxxxxxxxxxxx`
6. SHA-256 hash + prefix stored in DB
7. Plain key shown once — user must copy it

### Usage
```
Authorization: Basic base64(email:vso_xxxxxxxxxxxxxxxxxxxx)
```

On each request:
1. Extract email and key from Basic Auth header
2. Look up user by email
3. Find API key by prefix match (first 8 chars)
4. SHA-256 hash the provided key and compare to stored hash
5. Verify scopes include the required scope for this endpoint
6. Update `last_used_at`

### Scopes

| Scope | Access |
|-------|--------|
| `opds` | Browse OPDS catalog, download books, view covers |
| `api` | Full API access equivalent to JWT auth |

## Authorization

Role-based access control with two roles:

| Role | Capabilities |
|------|-------------|
| `user` | Manage own books, shelves, progress, annotations, API keys |
| `admin` | Everything user can do + manage users, system settings, invites |

Books are scoped to the user who uploaded them by default. Future consideration: shared library mode where all users see all books.

## Security Considerations

- Passwords hashed with bcrypt (cost 12)
- Refresh tokens rotated on every use (detect replay)
- OIDC uses PKCE (proof key for code exchange)
- API keys are hashed, never stored in plain text
- Rate limiting on auth endpoints (10/min per IP)
- CORS configured to only allow the frontend origin
- All cookies are httpOnly, secure, sameSite=strict
- Session table allows "log out everywhere" by deleting all sessions
