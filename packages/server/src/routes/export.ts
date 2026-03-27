import type { FastifyInstance } from "fastify";
import archiver from "archiver";
import { createAuthHook } from "../middleware/auth.js";
import { buildExportData } from "../services/library-export.js";
import type { StorageService } from "../services/storage.js";
import type { AppDatabase } from "../db/client.js";
import type { Config } from "../config.js";
import fs from "node:fs";

export function registerExportRoute(
  app: FastifyInstance,
  db: AppDatabase,
  storage: StorageService,
  config: Config
) {
  const authHook = createAuthHook(config);

  app.get(
    "/api/export/library",
    { preHandler: authHook },
    async (req, reply) => {
      const user = req.user!;
      const userId = user.sub;

      const exportData = await buildExportData(db, userId);

      const dateStr = new Date().toISOString().split("T")[0];
      const folderName = `verso-backup-${dateStr}`;

      reply.raw.setHeader("Content-Type", "application/zip");
      reply.raw.setHeader(
        "Content-Disposition",
        `attachment; filename="${folderName}.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 6 } });

      archive.on("error", (err) => {
        app.log.error({ err }, "Archive error");
        if (!reply.raw.headersSent) {
          reply.raw.statusCode = 500;
        }
        reply.raw.end();
      });

      archive.pipe(reply.raw);

      // Add JSON files
      archive.append(JSON.stringify(exportData.metadata, null, 2), {
        name: `${folderName}/metadata.json`,
      });
      archive.append(JSON.stringify(exportData.annotations, null, 2), {
        name: `${folderName}/annotations.json`,
      });
      archive.append(JSON.stringify(exportData.progress, null, 2), {
        name: `${folderName}/progress.json`,
      });

      // Add book files
      for (const book of exportData.metadata.books) {
        if (book.filePath) {
          const fullPath = storage.fullPath(book.filePath);
          try {
            await fs.promises.access(fullPath);
            const safeName = book.title.replace(/[^a-z0-9\-_.]/gi, "_").slice(0, 100);
            const ext = book.fileFormat || "epub";
            archive.file(fullPath, {
              name: `${folderName}/books/${book.id}-${safeName}.${ext}`,
            });
          } catch {
            // File not found, skip
          }
        }

        // Add cover file
        if (book.coverPath) {
          const fullCoverPath = storage.fullPath(book.coverPath);
          try {
            await fs.promises.access(fullCoverPath);
            archive.file(fullCoverPath, {
              name: `${folderName}/covers/${book.id}.jpg`,
            });
          } catch {
            // Cover not found, skip
          }
        }
      }

      await archive.finalize();
    }
  );
}
