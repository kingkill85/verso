import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";
import { booksRouter } from "./routers/books.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
});

export type AppRouter = typeof appRouter;
