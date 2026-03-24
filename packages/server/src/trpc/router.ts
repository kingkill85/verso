import { router } from "./index.js";
import { authRouter } from "./routers/auth.js";

export const appRouter = router({
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
