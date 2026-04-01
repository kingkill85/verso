import { z } from "zod";

export const publisherListInput = z.object({
  search: z.string().optional(),
});

export const publisherUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
});
