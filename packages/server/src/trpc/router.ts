import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";
import { booksRouter } from "./routers/books.js";
import { progressRouter } from "./routers/progress.js";
import { shelvesRouter } from "./routers/shelves.js";
import { metadataRouter } from "./routers/metadata.js";
import { annotationsRouter } from "./routers/annotations.js";
import { statsRouter } from "./routers/stats.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  progress: progressRouter,
  shelves: shelvesRouter,
  metadata: metadataRouter,
  annotations: annotationsRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
