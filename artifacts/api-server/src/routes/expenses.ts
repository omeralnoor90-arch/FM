import { Router, type IRouter } from "express";
import { db, expensesTable, workersTable } from "@workspace/db";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import {
  CreateExpenseBody,
  ListExpensesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serialize(
  e: typeof expensesTable.$inferSelect,
  workerName: string | null,
) {
  return {
    id: e.id,
    description: e.description,
    amount: Number(e.amount),
    category: e.category,
    workerId: e.workerId,
    workerName,
    paidWith: e.paidWith,
    invoiceObjectPath: e.invoiceObjectPath ?? null,
    occurredAt: e.occurredAt.toISOString(),
  };
}

router.get("/expenses", async (req, res) => {
  const params = ListExpensesQueryParams.parse(req.query);
  const conds = [];
  if (params.workerId !== undefined)
    conds.push(eq(expensesTable.workerId, params.workerId));
  if (params.from)
    conds.push(gte(expensesTable.occurredAt, new Date(params.from)));
  if (params.to)
    conds.push(lte(expensesTable.occurredAt, new Date(params.to)));

  const rows = await db
    .select({ expense: expensesTable, workerName: workersTable.name })
    .from(expensesTable)
    .leftJoin(workersTable, eq(expensesTable.workerId, workersTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(expensesTable.occurredAt));

  res.json(rows.map((r) => serialize(r.expense, r.workerName)));
});

router.post("/expenses", async (req, res) => {
  const body = CreateExpenseBody.parse(req.body);
  const [row] = await db
    .insert(expensesTable)
    .values({
      description: body.description,
      amount: body.amount.toFixed(2),
      category: body.category,
      workerId: body.workerId ?? null,
      paidWith: body.paidWith,
      invoiceObjectPath: body.invoiceObjectPath ?? null,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    })
    .returning();
  let workerName: string | null = null;
  if (row!.workerId) {
    const [w] = await db
      .select({ name: workersTable.name })
      .from(workersTable)
      .where(eq(workersTable.id, row!.workerId));
    workerName = w?.name ?? null;
  }
  res.status(201).json(serialize(row!, workerName));
});

router.put("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = CreateExpenseBody.parse(req.body);
  const [row] = await db
    .update(expensesTable)
    .set({
      description: body.description,
      amount: body.amount.toFixed(2),
      category: body.category,
      workerId: body.workerId ?? null,
      paidWith: body.paidWith,
      invoiceObjectPath: body.invoiceObjectPath !== undefined ? (body.invoiceObjectPath ?? null) : undefined,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    })
    .where(eq(expensesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  let workerName: string | null = null;
  if (row.workerId) {
    const [w] = await db
      .select({ name: workersTable.name })
      .from(workersTable)
      .where(eq(workersTable.id, row.workerId));
    workerName = w?.name ?? null;
  }
  res.json(serialize(row, workerName));
});

router.delete("/expenses/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.status(204).end();
});

export default router;
