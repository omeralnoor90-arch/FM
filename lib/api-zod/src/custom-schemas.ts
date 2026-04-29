import { z } from "zod/v4";

export const CreateWorkerDebtBody = z.object({
  amount: z.number(),
  description: z.string(),
  occurredAt: z.string().nullable().optional(),
});

export const UpdateWorkerDebtBody = z.object({
  amount: z.number().optional(),
  description: z.string().optional(),
  collected: z.boolean().optional(),
  occurredAt: z.string().nullable().optional(),
});

export const CreateWorkerTransferBody = z.object({
  fromWorkerId: z.number().int(),
  toWorkerId: z.number().int(),
  amount: z.number(),
  note: z.string().nullable().optional(),
  occurredAt: z.string().nullable().optional(),
});
