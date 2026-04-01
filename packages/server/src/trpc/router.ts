import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";
import { booksRouter } from "./routers/books.js";
import { progressRouter } from "./routers/progress.js";
import { shelvesRouter } from "./routers/shelves.js";
import { metadataRouter } from "./routers/metadata.js";
import { annotationsRouter } from "./routers/annotations.js";
import { statsRouter } from "./routers/stats.js";
import { appPasswordRouter } from "./routers/app-password.js";
import { adminRouter } from "./routers/admin.js";
import { kindleRouter } from "./routers/kindle.js";
import { authorsRouter } from "./routers/authors.js";
import { genresRouter } from "./routers/genres.js";
import { publishersRouter } from "./routers/publishers.js";
import { seriesRouter } from "./routers/series.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  progress: progressRouter,
  shelves: shelvesRouter,
  metadata: metadataRouter,
  annotations: annotationsRouter,
  stats: statsRouter,
  appPassword: appPasswordRouter,
  admin: adminRouter,
  kindle: kindleRouter,
  authors: authorsRouter,
  genres: genresRouter,
  publishers: publishersRouter,
  series: seriesRouter,
});

export type AppRouter = typeof appRouter;
