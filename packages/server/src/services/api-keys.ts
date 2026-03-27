import { createHash, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { apiKeys, users } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  return "vso_" + randomBytes(24).toString("base64url");
}

export async function createApiKey(
  db: AppDatabase,
  userId: string,
  name: string,
  scopes: string[],
  expiresAt?: string,
) {
  const plainKey = generateKey();
  const keyHash = hashKey(plainKey);
  const keyPrefix = plainKey.slice(0, 12);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes: JSON.stringify(scopes),
      expiresAt: expiresAt || null,
    })
    .returning();

  return { plainKey, apiKey };
}

export async function verifyApiKey(
  db: AppDatabase,
  email: string,
  key: string,
  requiredScope: string,
): Promise<{ userId: string; email: string; role: string } | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user) return null;

  const prefix = key.slice(0, 12);
  const userKeys = await db.query.apiKeys.findMany({
    where: and(eq(apiKeys.userId, user.id), eq(apiKeys.keyPrefix, prefix)),
  });

  const keyHash = hashKey(key);
  const matched = userKeys.find((k) => k.keyHash === keyHash);
  if (!matched) return null;

  // Check expiry
  if (matched.expiresAt && new Date(matched.expiresAt) < new Date()) return null;

  // Check scope
  const scopes: string[] = JSON.parse(matched.scopes);
  if (!scopes.includes(requiredScope)) return null;

  // Update last_used_at
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, matched.id));

  return { userId: user.id, email: user.email, role: user.role };
}

export async function listApiKeys(db: AppDatabase, userId: string) {
  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.userId, userId),
  });
  return keys.map(({ keyHash, ...rest }) => rest);
}

export async function revokeApiKey(db: AppDatabase, userId: string, keyId: string) {
  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
}
