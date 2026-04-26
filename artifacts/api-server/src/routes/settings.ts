import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function ensureSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows[0]) return rows[0];
  const [row] = await db.insert(settingsTable).values({}).returning();
  return row!;
}

function serialize(s: typeof settingsTable.$inferSelect) {
  return {
    id: s.id,
    currency: s.currency,
    cardFeePercent: Number(s.cardFeePercent),
    defaultWorkerPercent: Number(s.defaultWorkerPercent),
    defaultWorkshopPercent: Number(s.defaultWorkshopPercent),
  };
}

router.get("/settings", async (_req, res) => {
  const s = await ensureSettings();
  res.json(serialize(s));
});

router.put("/settings", async (req, res) => {
  const body = UpdateSettingsBody.parse(req.body);
  const current = await ensureSettings();
  const update: Record<string, unknown> = {};
  if (body.currency !== undefined) update["currency"] = body.currency;
  if (body.cardFeePercent !== undefined)
    update["cardFeePercent"] = body.cardFeePercent.toString();
  if (body.defaultWorkerPercent !== undefined)
    update["defaultWorkerPercent"] = body.defaultWorkerPercent.toString();
  if (body.defaultWorkshopPercent !== undefined)
    update["defaultWorkshopPercent"] = body.defaultWorkshopPercent.toString();
  const [row] = await db
    .update(settingsTable)
    .set(update)
    .where(eq(settingsTable.id, current.id))
    .returning();
  res.json(serialize(row!));
});

export default router;
export { ensureSettings, serialize as serializeSettings };
