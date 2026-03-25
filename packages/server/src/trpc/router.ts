import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";
import { booksRouter } from "./routers/books.js";
import { progressRouter } from "./routers/progress.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  progress: progressRouter,
});

export type AppRouter = typeof appRouter;
