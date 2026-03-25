import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";
import { booksRouter } from "./routers/books.js";
import { progressRouter } from "./routers/progress.js";
import { shelvesRouter } from "./routers/shelves.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  progress: progressRouter,
  shelves: shelvesRouter,
});

export type AppRouter = typeof appRouter;
