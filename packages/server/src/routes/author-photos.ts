import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { authors } from "@verso/shared";
import { verifyAccessToken } from "../services/jwt.js";
import sharp from "sharp";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";

export function registerAuthorPhotosRoute(app: FastifyInstance, db: AppDatabase, storage: StorageService, config: Config) {
  // Serve author photo — no auth (unguessable UUID)
  app.get("/api/authors/:authorId/photo", async (req, reply) => {
    const { authorId } = req.params as { authorId: string };

    const author = await db.query.authors.findFirst({
      where: eq(authors.id, authorId),
    });
    if (!author || !author.imagePath) return reply.status(404).send({ error: "Photo not found" });

    const exists = await storage.exists(author.imagePath);
    if (!exists) return reply.status(404).send({ error: "Photo file not found" });

    const photoData = await storage.get(author.imagePath);
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "no-cache").send(photoData);
  });

  // Upload author photo — admin only
  app.post("/api/authors/:authorId/photo", async (req, reply) => {
    const { authorId } = req.params as { authorId: string };

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ error: "Unauthorized" });
    let user;
    try {
      user = await verifyAccessToken(authHeader.slice(7), config);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (user.role !== "admin") return reply.status(403).send({ error: "Admin access required" });

    const author = await db.query.authors.findFirst({
      where: eq(authors.id, authorId),
    });
    if (!author) return reply.status(404).send({ error: "Author not found" });

    const file = await req.file();
    if (!file) return reply.status(400).send({ error: "No file uploaded" });

    const buffer = await file.toBuffer();
    const processed = await sharp(buffer)
      .resize(400, 400, { fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const imagePath = `authors/${authorId}/photo.jpg`;
    await storage.put(imagePath, processed);

    await db.update(authors).set({
      imagePath,
      updatedAt: new Date().toISOString(),
    }).where(eq(authors.id, authorId));

    return { success: true, imagePath };
  });

  // Delete author photo — admin only
  app.delete("/api/authors/:authorId/photo", async (req, reply) => {
    const { authorId } = req.params as { authorId: string };

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ error: "Unauthorized" });
    let user;
    try {
      user = await verifyAccessToken(authHeader.slice(7), config);
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (user.role !== "admin") return reply.status(403).send({ error: "Admin access required" });

    const author = await db.query.authors.findFirst({
      where: eq(authors.id, authorId),
    });
    if (!author) return reply.status(404).send({ error: "Author not found" });

    if (author.imagePath) {
      await storage.delete(author.imagePath);
      await db.update(authors).set({
        imagePath: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(authors.id, authorId));
    }

    return { success: true };
  });
}
