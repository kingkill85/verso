import { z } from "zod";

export const kosyncProgressPushInput = z.object({
  document: z.string().min(1),
  progress: z.string().min(1),
  percentage: z.number().min(0).max(1),
  device: z.string().min(1),
  device_id: z.string().min(1),
});

export const kosyncProgressPullParams = z.object({
  document: z.string().min(1),
});
