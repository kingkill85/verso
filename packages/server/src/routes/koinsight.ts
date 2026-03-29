import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { devices, koinsightDeviceInput } from "@verso/shared";
import { createPluginAuthHook } from "../middleware/kosync-auth.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import type { StorageService } from "../services/storage.js";

const MIN_VERSION = [0, 3, 0];

function isVersionValid(version: string): boolean {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_VERSION[i]) return true;
    if (parts[i] < MIN_VERSION[i]) return false;
  }
  return true; // equal
}

export function registerKoInsightRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config,
) {
  const authHook = createPluginAuthHook(config, db);

  // GET /api/plugin/health — no auth
  app.get("/api/plugin/health", async (_req, reply) => {
    return reply.send({ status: "ok", version: "0.3.0" });
  });

  // POST /api/plugin/device — register device
  app.post("/api/plugin/device", { preHandler: authHook }, async (req, reply) => {
    const parsed = koinsightDeviceInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid request body" });
    }

    const { version, id, model } = parsed.data;
    if (!isVersionValid(version)) {
      return reply.code(400).send({ message: `Plugin version ${version} is below minimum 0.3.0` });
    }

    const userId = req.user!.sub;
    const now = new Date().toISOString();

    const existing = await db.select().from(devices).where(eq(devices.id, id)).get();
    if (existing) {
      await db.update(devices).set({ model, lastSeen: now }).where(eq(devices.id, id));
    } else {
      await db.insert(devices).values({ id, userId, model, lastSeen: now });
    }

    return reply.send({ message: "Device registered successfully" });
  });
}
