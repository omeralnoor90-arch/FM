import { Router, type IRouter } from "express";
import { db, partsTable } from "@workspace/db";
import { and, gte, lte, desc, eq } from "drizzle-orm";
import { CreatePartBody, ListPartsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function serialize(p: typeof partsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    supplier: p.supplier,
    amount: Number(p.amount),
    quantity: Number(p.quantity),
    paidWith: p.paidWith,
    jobId: p.jobId,
    invoiceObjectPath: p.invoiceObjectPath ?? null,
    occurredAt: p.occurredAt.toISOString(),
  };
}

router.get("/parts", async (req, res) => {
  const params = ListPartsQueryParams.parse(req.query);
  const conds = [];
  if (params.from)
    conds.push(gte(partsTable.occurredAt, new Date(params.from)));
  if (params.to) conds.push(lte(partsTable.occurredAt, new Date(params.to)));
  const rows = await db
    .select()
    .from(partsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(partsTable.occurredAt));
  res.json(rows.map(serialize));
});

router.post("/parts", async (req, res) => {
  const body = CreatePartBody.parse(req.body);
  const [row] = await db
    .insert(partsTable)
    .values({
      name: body.name,
      supplier: body.supplier ?? null,
      amount: body.amount.toFixed(2),
      quantity: (body.quantity ?? 1).toString(),
      paidWith: body.paidWith,
      jobId: body.jobId ?? null,
      invoiceObjectPath: body.invoiceObjectPath ?? null,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    })
    .returning();
  res.status(201).json(serialize(row!));
});

router.put("/parts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = CreatePartBody.parse(req.body);
  const [row] = await db
    .update(partsTable)
    .set({
      name: body.name,
      supplier: body.supplier ?? null,
      amount: body.amount.toFixed(2),
      quantity: (body.quantity ?? 1).toString(),
      paidWith: body.paidWith,
      jobId: body.jobId ?? null,
      invoiceObjectPath: body.invoiceObjectPath !== undefined ? (body.invoiceObjectPath ?? null) : undefined,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    })
    .where(eq(partsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(row));
});

router.delete("/parts/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(partsTable).where(eq(partsTable.id, id));
  res.status(204).end();
});

export default router;
