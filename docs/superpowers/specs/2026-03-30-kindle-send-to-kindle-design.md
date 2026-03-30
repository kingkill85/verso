# Send to Kindle — Design Spec

## Overview

Allow users to send books from their Verso library to a Kindle device via Amazon's "Send to Kindle" email service. Users configure their own SMTP provider (Gmail, Outlook, etc.) in Account settings, with guided setup including app password instructions.

## Architecture

Per-user SMTP configuration stored in the database. Book files sent as email attachments via `nodemailer`. Amazon handles format conversion on their end. No server-level SMTP config required — each user brings their own.

## Database

### `smtpSettings` table

| Column            | Type    | Notes                                        |
|-------------------|---------|----------------------------------------------|
| id                | TEXT PK | UUID                                         |
| userId            | TEXT FK | → users.id, UNIQUE (one config per user)     |
| provider          | TEXT    | gmail, outlook, icloud, yahoo, custom        |
| host              | TEXT    | SMTP host (e.g., smtp.gmail.com)             |
| port              | INTEGER | SMTP port (465, 587, etc.)                   |
| username          | TEXT    | SMTP username (usually email address)        |
| encryptedPassword | TEXT    | AES-256-GCM encrypted SMTP password          |
| encryption        | TEXT    | ssl, starttls, none                          |
| kindleEmail       | TEXT    | User's @kindle.com address                   |
| createdAt         | TEXT    | ISO timestamp                                |
| updatedAt         | TEXT    | ISO timestamp                                |

## Password Encryption

SMTP passwords encrypted at rest using AES-256-GCM. Encryption key derived from `JWT_SECRET` via HKDF (using Node.js `crypto.hkdf` with info string `"smtp-encryption"`). This avoids introducing a new secret while keeping passwords unreadable in the database.

## Provider Presets

Pre-configured SMTP settings for common providers. Selecting a preset pre-fills host, port, and encryption. Each preset includes a collapsible help panel with step-by-step instructions for generating an app password.

| Provider     | Host                   | Port | Encryption | App Password Instructions                                                                 |
|--------------|------------------------|------|------------|-------------------------------------------------------------------------------------------|
| Gmail        | smtp.gmail.com         | 465  | SSL        | myaccount.google.com → Security → 2-Step Verification → App passwords → Create for "Mail" |
| Outlook      | smtp-mail.outlook.com  | 587  | STARTTLS   | account.microsoft.com → Security → App passwords → Create new                             |
| iCloud       | smtp.mail.me.com       | 587  | STARTTLS   | appleid.apple.com → Security → App-specific passwords → Generate                          |
| Yahoo        | smtp.mail.yahoo.com    | 465  | SSL        | login.yahoo.com → Account Security → App password → Generate                              |
| Custom       | (user fills in)        | —    | —          | No preset help — user provides all fields                                                 |

## Backend

### Dependencies

- `nodemailer` — standard Node.js email library, well-maintained, zero native deps

### New Files

- `packages/shared/src/kindle-validators.ts` — Zod schemas for SMTP settings input/output
- `packages/server/src/services/kindle.ts` — SMTP transport creation, email sending, password encrypt/decrypt
- `packages/server/src/trpc/routers/kindle.ts` — tRPC router

### tRPC Router: `kindle`

| Procedure        | Type     | Description                                    |
|------------------|----------|------------------------------------------------|
| `getSettings`    | query    | Returns current SMTP config (password masked)  |
| `saveSettings`   | mutation | Upsert SMTP config, encrypts password          |
| `deleteSettings` | mutation | Remove SMTP config                             |
| `testConnection` | mutation | Verify SMTP credentials by connecting + EHLO   |
| `sendBook`       | mutation | Send a book file to the configured Kindle email |

### `services/kindle.ts`

```
encryptPassword(plaintext: string, jwtSecret: string): string
  → HKDF derive key → AES-256-GCM encrypt → return iv:authTag:ciphertext (hex)

decryptPassword(encrypted: string, jwtSecret: string): string
  → split iv:authTag:ciphertext → HKDF derive key → AES-256-GCM decrypt

createTransport(settings: SmtpSettings, jwtSecret: string): nodemailer.Transporter
  → decrypt password → configure nodemailer with host/port/auth/tls

sendBookToKindle(transport, kindleEmail, fromEmail, book, fileBuffer): Promise<void>
  → compose email with subject "Your Book from Verso: {title}"
  → attach book file with original filename
  → send
```

### Email Composition

- **From**: user's SMTP username (their email)
- **To**: user's `@kindle.com` address
- **Subject**: `Your Book from Verso: {title}`
- **Body**: `"{title}" by {author} — sent from Verso`
- **Attachment**: book file with original filename and correct MIME type

## Frontend

### Account Page: "Send to Kindle" Section

- Provider preset dropdown (Gmail, Outlook, iCloud, Yahoo, Custom)
- Collapsible help panel per provider (shows app password setup steps)
- SMTP fields: host, port, username, password, encryption (pre-filled by preset, editable)
- Kindle email field with `@kindle.com` placeholder hint
- "Test Connection" button — verifies SMTP credentials, shows success/error
- Save / Delete buttons

### Book Detail View

- "Send to Kindle" button (only visible when SMTP is configured)
- Click → async send → toast notification: "Sending {title} to Kindle..." → success or error toast
- Disabled state while sending (prevent double-send)

## Error Handling

| Scenario              | Behavior                                                        |
|-----------------------|-----------------------------------------------------------------|
| SMTP auth failure     | Clear error: "Authentication failed — check your app password"  |
| Connection timeout    | "Could not connect — check host, port, and encryption settings" |
| File > 50MB           | Warning before send: "Amazon limits attachments to 50MB"        |
| No SMTP configured    | "Send to Kindle" button hidden; setup prompt in Account page    |
| Invalid Kindle email  | Client-side validation: must contain "kindle" in domain (covers @kindle.com, @kindle.cn, @free.kindle.com) |

## Security

- SMTP passwords never returned to the frontend (masked as `••••••••`)
- Password encryption key derived from existing `JWT_SECRET` — no new secrets
- SMTP connections use TLS/STARTTLS as configured — never plain text by default
- Rate limiting: inherit existing Fastify rate limits

## i18n

All UI strings added to the existing i18n translation files. Key namespace: `kindle.*` (e.g., `kindle.sendToKindle`, `kindle.testConnection`, `kindle.providerHelp.gmail`).
