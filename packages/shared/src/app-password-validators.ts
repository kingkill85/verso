import { z } from "zod";

export const appPasswordSetInput = z.object({
  password: z.string().min(8),
});
