# Send to Kindle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to send books to their Kindle via email, with guided SMTP setup (presets for Gmail, Outlook, iCloud, Yahoo).

**Architecture:** Per-user SMTP config stored encrypted in the `smtpSettings` table. `nodemailer` sends book files as email attachments. tRPC router for settings CRUD + send. Frontend: Account page settings section + "Send to Kindle" in book overflow menu.

**Tech Stack:** nodemailer, AES-256-GCM (Node.js crypto), Drizzle ORM, tRPC, React

---

### Task 1: Database Schema + Migration

**Files:**
- Modify: `packages/shared/src/schema.ts`
- Generate: `packages/server/drizzle/0009_*.sql` (via drizzle-kit)

- [ ] **Step 1: Add `smtpSettings` table to schema**

In `packages/shared/src/schema.ts`, add after the `pageStats` table definition:

```typescript
export const smtpSettings = sqliteTable("smtp_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  provider: text("provider", { length: 20 }).notNull().default("custom"),
  host: text("host", { length: 255 }).notNull(),
  port: integer("port").notNull(),
  username: text("username", { length: 255 }).notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  encryption: text("encryption", { length: 10 }).notNull().default("ssl"),
  kindleEmail: text("kindle_email", { length: 255 }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Generate migration**

Run from `packages/server`:

```bash
cd packages/server && npx drizzle-kit generate
```

Expected: new migration file `drizzle/0009_*.sql` with `CREATE TABLE smtp_settings`.

- [ ] **Step 3: Verify migration looks correct**

Read the generated SQL file. It should contain a single `CREATE TABLE` statement with all columns matching the schema above.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schema.ts packages/server/drizzle/
git commit -m "feat(kindle): add smtpSettings table schema and migration"
```

---

### Task 2: Zod Validators

**Files:**
- Create: `packages/shared/src/kindle-validators.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create kindle validators**

Create `packages/shared/src/kindle-validators.ts`:

```typescript
import { z } from "zod";

export const smtpProvider = z.enum(["gmail", "outlook", "icloud", "yahoo", "custom"]);

export const smtpEncryption = z.enum(["ssl", "starttls", "none"]);

export const kindleEmailSchema = z
  .string()
  .email()
  .refine((email) => email.includes("kindle"), {
    message: "Must be a Kindle email address (e.g. name@kindle.com)",
  });

export const smtpSettingsInput = z.object({
  provider: smtpProvider,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(255),
  password: z.string().min(1),
  encryption: smtpEncryption,
  kindleEmail: kindleEmailSchema,
});

export type SmtpSettingsInput = z.infer<typeof smtpSettingsInput>;

export const sendBookInput = z.object({
  bookId: z.string().uuid(),
});
```

- [ ] **Step 2: Export from shared index**

In `packages/shared/src/index.ts`, add:

```typescript
export * from "./kindle-validators.js";
```

- [ ] **Step 3: Verify build**

```bash
cd packages/shared && pnpm build
```

Expected: clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/kindle-validators.ts packages/shared/src/index.ts
git commit -m "feat(kindle): add Zod validators for SMTP settings"
```

---

### Task 3: Kindle Service — Encryption + Email Sending

**Files:**
- Create: `packages/server/src/services/kindle.ts`

- [ ] **Step 1: Install nodemailer**

```bash
cd packages/server && pnpm add nodemailer && pnpm add -D @types/nodemailer
```

- [ ] **Step 2: Create the kindle service**

Create `packages/server/src/services/kindle.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes, hkdf } from "node:crypto";
import { promisify } from "node:util";
import nodemailer from "nodemailer";
import type { SmtpSettingsInput } from "@verso/shared";

const hkdfAsync = promisify(hkdf);

async function deriveKey(jwtSecret: string): Promise<Buffer> {
  const derived = await hkdfAsync("sha256", jwtSecret, "", "smtp-encryption", 32);
  return Buffer.from(derived);
}

export async function encryptPassword(plaintext: string, jwtSecret: string): Promise<string> {
  const key = await deriveKey(jwtSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export async function decryptPassword(encrypted: string, jwtSecret: string): Promise<string> {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
  const key = await deriveKey(jwtSecret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

function createTransport(settings: {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: string;
}) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.encryption === "ssl",
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    ...(settings.encryption === "starttls" ? { requireTLS: true } : {}),
  });
}

export async function testSmtpConnection(
  settings: SmtpSettingsInput,
): Promise<void> {
  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    username: settings.username,
    password: settings.password,
    encryption: settings.encryption,
  });
  await transport.verify();
  transport.close();
}

export async function sendBookToKindle(options: {
  host: string;
  port: number;
  username: string;
  encryptedPassword: string;
  encryption: string;
  kindleEmail: string;
  jwtSecret: string;
  bookTitle: string;
  bookAuthor: string;
  fileName: string;
  fileBuffer: Buffer;
}): Promise<void> {
  const password = await decryptPassword(options.encryptedPassword, options.jwtSecret);

  const transport = createTransport({
    host: options.host,
    port: options.port,
    username: options.username,
    password,
    encryption: options.encryption,
  });

  await transport.sendMail({
    from: options.username,
    to: options.kindleEmail,
    subject: `Your Book from Verso: ${options.bookTitle}`,
    text: `"${options.bookTitle}" by ${options.bookAuthor} — sent from Verso`,
    attachments: [
      {
        filename: options.fileName,
        content: options.fileBuffer,
      },
    ],
  });

  transport.close();
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/kindle.ts packages/server/package.json packages/server/pnpm-lock.yaml
git commit -m "feat(kindle): add kindle service with SMTP encryption and email sending"
```

Note: the pnpm-lock.yaml may be at the workspace root — add that too if needed.

---

### Task 4: tRPC Router

**Files:**
- Create: `packages/server/src/trpc/routers/kindle.ts`
- Modify: `packages/server/src/trpc/router.ts`

- [ ] **Step 1: Create the kindle router**

Create `packages/server/src/trpc/routers/kindle.ts`:

```typescript
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index.js";
import { smtpSettings, smtpSettingsInput, sendBookInput, books } from "@verso/shared";
import { encryptPassword, testSmtpConnection, sendBookToKindle } from "../../services/kindle.js";

export const kindleRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db
      .select({
        provider: smtpSettings.provider,
        host: smtpSettings.host,
        port: smtpSettings.port,
        username: smtpSettings.username,
        encryption: smtpSettings.encryption,
        kindleEmail: smtpSettings.kindleEmail,
      })
      .from(smtpSettings)
      .where(eq(smtpSettings.userId, ctx.user.sub))
      .get();

    return settings ?? null;
  }),

  saveSettings: protectedProcedure
    .input(smtpSettingsInput)
    .mutation(async ({ ctx, input }) => {
      const encrypted = await encryptPassword(input.password, ctx.config.JWT_SECRET);

      const existing = await ctx.db
        .select({ id: smtpSettings.id })
        .from(smtpSettings)
        .where(eq(smtpSettings.userId, ctx.user.sub))
        .get();

      const now = new Date().toISOString();

      if (existing) {
        await ctx.db
          .update(smtpSettings)
          .set({
            provider: input.provider,
            host: input.host,
            port: input.port,
            username: input.username,
            encryptedPassword: encrypted,
            encryption: input.encryption,
            kindleEmail: input.kindleEmail,
            updatedAt: now,
          })
          .where(eq(smtpSettings.id, existing.id));
      } else {
        await ctx.db.insert(smtpSettings).values({
          userId: ctx.user.sub,
          provider: input.provider,
          host: input.host,
          port: input.port,
          username: input.username,
          encryptedPassword: encrypted,
          encryption: input.encryption,
          kindleEmail: input.kindleEmail,
        });
      }

      return { success: true };
    }),

  deleteSettings: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(smtpSettings)
      .where(eq(smtpSettings.userId, ctx.user.sub));
    return { success: true };
  }),

  testConnection: protectedProcedure
    .input(smtpSettingsInput)
    .mutation(async ({ input }) => {
      try {
        await testSmtpConnection(input);
        return { success: true, message: "Connection successful" };
      } catch (err: any) {
        const message = err.code === "EAUTH"
          ? "Authentication failed — check your app password"
          : err.code === "ECONNECTION" || err.code === "ETIMEDOUT"
            ? "Could not connect — check host, port, and encryption settings"
            : `Connection failed: ${err.message}`;
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  sendBook: protectedProcedure
    .input(sendBookInput)
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db
        .select()
        .from(smtpSettings)
        .where(eq(smtpSettings.userId, ctx.user.sub))
        .get();

      if (!settings) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "SMTP settings not configured. Set up Send to Kindle in Account settings.",
        });
      }

      const book = await ctx.db
        .select()
        .from(books)
        .where(eq(books.id, input.bookId))
        .get();

      if (!book) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      if (book.fileSize > 50 * 1024 * 1024) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "File exceeds Amazon's 50MB attachment limit",
        });
      }

      const fileBuffer = await ctx.storage.get(book.filePath);
      const ext = book.fileFormat || "epub";
      const fileName = `${book.title}.${ext}`;

      try {
        await sendBookToKindle({
          host: settings.host,
          port: settings.port,
          username: settings.username,
          encryptedPassword: settings.encryptedPassword,
          encryption: settings.encryption,
          kindleEmail: settings.kindleEmail,
          jwtSecret: ctx.config.JWT_SECRET,
          bookTitle: book.title,
          bookAuthor: book.author,
          fileName,
          fileBuffer,
        });
      } catch (err: any) {
        const message = err.code === "EAUTH"
          ? "Authentication failed — check your app password in Account settings"
          : `Failed to send email: ${err.message}`;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }

      return { success: true };
    }),
});
```

- [ ] **Step 2: Register in main router**

In `packages/server/src/trpc/router.ts`, add the import and register:

```typescript
import { kindleRouter } from "./routers/kindle.js";
```

Add to the `router({})` call:

```typescript
kindle: kindleRouter,
```

- [ ] **Step 3: Verify server builds**

```bash
cd packages/server && pnpm build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/trpc/routers/kindle.ts packages/server/src/trpc/router.ts
git commit -m "feat(kindle): add tRPC router for SMTP settings and send"
```

---

### Task 5: Frontend — Account Page "Send to Kindle" Section

**Files:**
- Modify: `packages/web/src/routes/_app/account.tsx`
- Modify: `packages/web/src/locales/en.json`

- [ ] **Step 1: Add i18n strings**

Add to `packages/web/src/locales/en.json` (before the closing `}`):

```json
  "kindle.title": "Send to Kindle",
  "kindle.description": "Send books to your Kindle via email. Configure your email provider and Kindle email address below.",
  "kindle.provider": "Email Provider",
  "kindle.host": "SMTP Host",
  "kindle.port": "Port",
  "kindle.username": "Email",
  "kindle.password": "App Password",
  "kindle.encryption": "Encryption",
  "kindle.kindleEmail": "Kindle Email",
  "kindle.kindleEmailPlaceholder": "yourname@kindle.com",
  "kindle.save": "Save",
  "kindle.saving": "Saving...",
  "kindle.saved": "Kindle settings saved",
  "kindle.delete": "Remove",
  "kindle.deleted": "Kindle settings removed",
  "kindle.testConnection": "Test Connection",
  "kindle.testing": "Testing...",
  "kindle.testSuccess": "Connection successful!",
  "kindle.custom": "Custom",
  "kindle.helpGmail": "Go to myaccount.google.com → Security → 2-Step Verification → App passwords → Create one for \"Mail\"",
  "kindle.helpOutlook": "Go to account.microsoft.com → Security → App passwords → Create new app password",
  "kindle.helpIcloud": "Go to appleid.apple.com → Security → App-specific passwords → Generate",
  "kindle.helpYahoo": "Go to login.yahoo.com → Account Security → Generate app password",
  "kindle.appPasswordHelp": "How to get an app password"
```

- [ ] **Step 2: Create the KindleSection component**

In `packages/web/src/routes/_app/account.tsx`, add the `KindleSection` component after the `AppPasswordSection` function. This is a large component — add it as a new function:

```typescript
const PROVIDER_PRESETS: Record<string, { host: string; port: number; encryption: string }> = {
  gmail: { host: "smtp.gmail.com", port: 465, encryption: "ssl" },
  outlook: { host: "smtp-mail.outlook.com", port: 587, encryption: "starttls" },
  icloud: { host: "smtp.mail.me.com", port: 587, encryption: "starttls" },
  yahoo: { host: "smtp.mail.yahoo.com", port: 465, encryption: "ssl" },
};

function KindleSection() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState("gmail");
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(465);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [encryption, setEncryption] = useState("ssl");
  const [kindleEmail, setKindleEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const settingsQuery = trpc.kindle.getSettings.useQuery(undefined, {
    onSuccess: (data) => {
      if (data && !loaded) {
        setProvider(data.provider);
        setHost(data.host);
        setPort(data.port);
        setUsername(data.username);
        setEncryption(data.encryption);
        setKindleEmail(data.kindleEmail);
        setLoaded(true);
      }
    },
  });

  const saveMut = trpc.kindle.saveSettings.useMutation({
    onSuccess: () => {
      setSuccess(t("kindle.saved"));
      setError("");
      settingsQuery.refetch();
    },
    onError: (err) => { setError(err.message); setSuccess(""); },
  });

  const deleteMut = trpc.kindle.deleteSettings.useMutation({
    onSuccess: () => {
      setSuccess(t("kindle.deleted"));
      setError("");
      setPassword("");
      settingsQuery.refetch();
    },
    onError: (err) => { setError(err.message); setSuccess(""); },
  });

  const testMut = trpc.kindle.testConnection.useMutation({
    onSuccess: () => {
      setSuccess(t("kindle.testSuccess"));
      setError("");
    },
    onError: (err) => { setError(err.message); setSuccess(""); },
  });

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    const preset = PROVIDER_PRESETS[newProvider];
    if (preset) {
      setHost(preset.host);
      setPort(preset.port);
      setEncryption(preset.encryption);
    }
  };

  const getFormData = () => ({
    provider: provider as any,
    host,
    port,
    username,
    password,
    encryption: encryption as any,
    kindleEmail,
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!password && !settingsQuery.data) {
      setError("Password is required");
      return;
    }
    saveMut.mutate(getFormData());
  };

  const helpKey = `kindle.help${provider.charAt(0).toUpperCase() + provider.slice(1)}` as any;
  const helpText = provider !== "custom" ? t(helpKey) : null;

  return (
    <div className="mt-10">
      <h2
        className="text-sm font-medium uppercase tracking-wider mb-2"
        style={{ color: "var(--text-dim)" }}
      >
        {t("kindle.title")}
      </h2>
      <p className="text-xs mb-4" style={{ color: "var(--text-faint)" }}>
        {t("kindle.description")}
      </p>

      {error && (
        <div className="text-sm p-3 rounded-lg mb-3" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#ef4444" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm p-3 rounded-lg mb-3" style={{ backgroundColor: "rgba(74,138,90,0.1)", color: "var(--green)" }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        {/* Provider */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.provider")}
          </label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook / Hotmail</option>
            <option value="icloud">iCloud</option>
            <option value="yahoo">Yahoo</option>
            <option value="custom">{t("kindle.custom")}</option>
          </select>
        </div>

        {/* App password help */}
        {helpText && (
          <div>
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-xs transition-colors hover:opacity-80"
              style={{ color: "var(--warm)" }}
            >
              {t("kindle.appPasswordHelp")} {showHelp ? "▾" : "▸"}
            </button>
            {showHelp && (
              <p className="text-xs mt-1 p-3 rounded-lg" style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}>
                {helpText}
              </p>
            )}
          </div>
        )}

        {/* Host + Port row */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
              {t("kindle.host")}
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
              {t("kindle.port")}
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
              className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.username")}
          </label>
          <input
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={settingsQuery.data ? "••••••••" : ""}
            required={!settingsQuery.data}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Encryption */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.encryption")}
          </label>
          <select
            value={encryption}
            onChange={(e) => setEncryption(e.target.value)}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="ssl">SSL/TLS (port 465)</option>
            <option value="starttls">STARTTLS (port 587)</option>
            <option value="none">None</option>
          </select>
        </div>

        {/* Kindle email */}
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
            {t("kindle.kindleEmail")}
          </label>
          <input
            type="email"
            value={kindleEmail}
            onChange={(e) => setKindleEmail(e.target.value)}
            placeholder={t("kindle.kindleEmailPlaceholder")}
            required
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--warm)]"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saveMut.isPending}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ backgroundColor: "var(--warm)" }}
          >
            {saveMut.isPending ? t("kindle.saving") : t("kindle.save")}
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              testMut.mutate(getFormData());
            }}
            disabled={testMut.isPending || !password}
            className="px-5 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          >
            {testMut.isPending ? t("kindle.testing") : t("kindle.testConnection")}
          </button>
          {settingsQuery.data && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuccess("");
                deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
              className="px-5 py-2.5 rounded-full text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: "#ef4444" }}
            >
              {t("kindle.delete")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add KindleSection to AccountPage**

In the `AccountPage` function's return JSX, add `<KindleSection />` after `<AppPasswordSection />`:

```tsx
      <AppPasswordSection />
      <KindleSection />
    </div>
  );
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd packages/web && pnpm build
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/routes/_app/account.tsx packages/web/src/locales/en.json
git commit -m "feat(kindle): add Send to Kindle settings section on Account page"
```

---

### Task 6: Frontend — "Send to Kindle" in Book Overflow Menu

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id.tsx`
- Modify: `packages/web/src/locales/en.json`

- [ ] **Step 1: Add i18n strings**

Add to `packages/web/src/locales/en.json`:

```json
  "kindle.sendToKindle": "Send to Kindle",
  "kindle.sending": "Sending...",
  "kindle.sent": "Sent to Kindle!",
  "kindle.sendFailed": "Failed to send to Kindle"
```

- [ ] **Step 2: Add Send to Kindle button to the OverflowMenu**

In `packages/web/src/routes/_app/books/$id.tsx`, inside the `OverflowMenu` function:

First, add the kindle settings query and send mutation inside the function body (after the existing `resetMutation`):

```typescript
  const kindleSettings = trpc.kindle.getSettings.useQuery();
  const sendToKindleMut = trpc.kindle.sendBook.useMutation({
    onSuccess: () => {
      setOpen(false);
    },
  });
```

Then, in the JSX dropdown menu, add the "Send to Kindle" button after the "Download" button (before the edit button):

```tsx
          {kindleSettings.data && (
            <button
              onClick={() => { sendToKindleMut.mutate({ bookId }); }}
              disabled={sendToKindleMut.isPending}
              className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "var(--text)" }}
            >
              {sendToKindleMut.isPending ? t("kindle.sending") : t("kindle.sendToKindle")}
            </button>
          )}
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd packages/web && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/_app/books/$id.tsx packages/web/src/locales/en.json
git commit -m "feat(kindle): add Send to Kindle button in book overflow menu"
```

---

### Task 7: Browser Test — End to End

**Files:**
- None created — manual/Playwright verification

- [ ] **Step 1: Start dev servers**

```bash
cd /Users/michaelkusche/dev/verso && pnpm dev
```

- [ ] **Step 2: Verify Account page renders Kindle section**

Navigate to the Account page in the browser. Verify:
- "Send to Kindle" section appears below App Password
- Provider dropdown works (selecting Gmail pre-fills host/port)
- Help text expands/collapses
- All fields are present

- [ ] **Step 3: Verify book detail overflow menu**

Navigate to any book's detail page. Open the overflow menu (three dots). Verify:
- "Send to Kindle" does NOT appear (because SMTP isn't configured yet)
- After configuring SMTP settings, the button appears

- [ ] **Step 4: Commit any fixes discovered during testing**

```bash
git add -A && git commit -m "fix(kindle): browser test fixes"
```

Only if fixes were needed.
