import { Router, type IRouter } from "express";
import { db, jobsTable, workersTable, jobExpenseLinesTable, jobWorkerSharesTable } from "@workspace/db";
import { and, eq, gte, lte, desc, inArray, ne } from "drizzle-orm";
import { CreateJobBody, ListJobsQueryParams, UpdateJobExpensesBody } from "@workspace/api-zod";
import { ensureSettings } from "./settings";
import { requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

type ExpenseLine = { id: number; description: string; amount: number; paidByWorkerId: number | null; paidByWorkerName: string | null };
type WorkerShareRow = { id: number; jobId: number; workerId: number; workerName: string; amount: number };

async function loadExpenseLines(jobIds: number[]): Promise<Map<number, ExpenseLine[]>> {
  if (jobIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: jobExpenseLinesTable.id,
      jobId: jobExpenseLinesTable.jobId,
      description: jobExpenseLinesTable.description,
      amount: jobExpenseLinesTable.amount,
      paidByWorkerId: jobExpenseLinesTable.paidByWorkerId,
      workerName: workersTable.name,
    })
    .from(jobExpenseLinesTable)
    .leftJoin(workersTable, eq(jobExpenseLinesTable.paidByWorkerId, workersTable.id))
    .where(jobIds.length === 1 ? eq(jobExpenseLinesTable.jobId, jobIds[0]!) : inArray(jobExpenseLinesTable.jobId, jobIds));
  const map = new Map<number, ExpenseLine[]>();
  for (const r of rows) {
    const arr = map.get(r.jobId) ?? [];
    arr.push({ id: r.id, description: r.description, amount: Number(r.amount), paidByWorkerId: r.paidByWorkerId ?? null, paidByWorkerName: r.workerName ?? null });
    map.set(r.jobId, arr);
  }
  return map;
}

async function loadWorkerShares(jobIds: number[]): Promise<Map<number, WorkerShareRow[]>> {
  if (jobIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(jobWorkerSharesTable)
    .where(jobIds.length === 1 ? eq(jobWorkerSharesTable.jobId, jobIds[0]!) : inArray(jobWorkerSharesTable.jobId, jobIds));
  const map = new Map<number, WorkerShareRow[]>();
  for (const r of rows) {
    const arr = map.get(r.jobId) ?? [];
    arr.push({ id: r.id, jobId: r.jobId, workerId: r.workerId, workerName: r.workerName, amount: Number(r.amount) });
    map.set(r.jobId, arr);
  }
  return map;
}

function computeWorkerPaidTotal(expenseLines: Array<{ paidByWorkerId?: number | null; amount: number }>, workerId: number) {
  return expenseLines.filter((l) => l.paidByWorkerId === workerId).reduce((s, l) => s + l.amount, 0);
}

function serialize(
  j: typeof jobsTable.$inferSelect,
  workerName: string | null,
  expenseLines: ExpenseLine[] = [],
  workerShares: WorkerShareRow[] = [],
  cashReceivedByName: string | null = null,
) {
  return {
    id: j.id,
    jobType: j.jobType,
    workerId: j.workerId,
    workerName,
    cashReceivedByWorkerId: j.cashReceivedByWorkerId ?? null,
    cashReceivedByName,
    source: j.source,
    paymentMethod: j.paymentMethod,
    grossAmount: Number(j.grossAmount),
    cardFeeAmount: Number(j.cardFeeAmount),
    vatPaidByCustomer: j.vatPaidByCustomer,
    expensesTotal: Number(j.expensesTotal),
    netAmount: Number(j.netAmount),
    workerShare: Number(j.workerShare),
    workshopShare: Number(j.workshopShare),
    plateNumber: j.plateNumber ?? null,
    carModel: j.carModel ?? null,
    notes: j.notes,
    expenseLines,
    workerShares,
    occurredAt: j.occurredAt.toISOString(),
    status: j.status,
    submittedByWorkerId: j.submittedByWorkerId ?? null,
  };
}

async function loadWorkerNames(workerIds: (number | null)[]): Promise<Map<number, string>> {
  const ids = workerIds.filter((id): id is number => id !== null);
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: workersTable.id, name: workersTable.name })
    .from(workersTable)
    .where(ids.length === 1 ? eq(workersTable.id, ids[0]!) : inArray(workersTable.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

router.get("/jobs", async (req, res) => {
  const params = ListJobsQueryParams.parse(req.query);
  const conds = [];
  if (params.workerId !== undefined)
    conds.push(eq(jobsTable.workerId, params.workerId));
  if (params.from) conds.push(gte(jobsTable.occurredAt, new Date(params.from)));
  if (params.to) conds.push(lte(jobsTable.occurredAt, new Date(params.to)));

  if (params.status === "pending") {
    conds.push(eq(jobsTable.status, "pending"));
  } else if (params.status === "rejected") {
    conds.push(eq(jobsTable.status, "rejected"));
  } else if (params.status === "all") {
    // no status filter — return everything
  } else {
    // default: approved only
    conds.push(eq(jobsTable.status, "approved"));
  }

  const rows = await db
    .select({ job: jobsTable, workerName: workersTable.name })
    .from(jobsTable)
    .leftJoin(workersTable, eq(jobsTable.workerId, workersTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(jobsTable.occurredAt));

  const jobIds = rows.map((r) => r.job.id);
  const cashWorkerIds = rows.map((r) => r.job.cashReceivedByWorkerId ?? null);
  const [linesMap, sharesMap, cashWorkerNames] = await Promise.all([
    loadExpenseLines(jobIds),
    loadWorkerShares(jobIds),
    loadWorkerNames(cashWorkerIds),
  ]);

  res.json(
    rows.map((r) => {
      const cashName = r.job.cashReceivedByWorkerId ? (cashWorkerNames.get(r.job.cashReceivedByWorkerId) ?? null) : null;
      return serialize(r.job, r.workerName ?? null, linesMap.get(r.job.id) ?? [], sharesMap.get(r.job.id) ?? [], cashName);
    }),
  );
});

router.post("/jobs", async (req, res) => {
  const body = CreateJobBody.parse(req.body);

  const settings = await ensureSettings();
  const cardFeePercent = Number(settings.cardFeePercent);

  const gross = body.grossAmount;
  const isCard = body.paymentMethod === "card";
  const vatPaidByCustomer = body.vatPaidByCustomer ?? true;
  // Always record VAT for card payments; only deduct from net when workshop absorbs it
  const vatAmount = isCard ? (gross * cardFeePercent) / 100 : 0;
  const vatDeducted = isCard && !vatPaidByCustomer ? vatAmount : 0;

  const expenseLines = (body.expenseLines ?? []).filter(
    (l) => l.description && l.amount > 0,
  );
  const expensesTotal = expenseLines.reduce((s, l) => s + l.amount, 0);
  const net = Math.max(0, gross - vatDeducted - expensesTotal);

  const jobType = body.jobType ?? "single";
  const cashReceivedByWorkerId = !isCard ? (body.cashReceivedByWorkerId ?? null) : null;

  // ── Single worker ──────────────────────────────────────────────────────────
  if (jobType === "single") {
    if (!body.workerId) {
      res.status(400).json({ error: "workerId is required for single jobs" });
      return;
    }
    const [worker] = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.id, body.workerId));
    if (!worker) {
      res.status(400).json({ error: "Worker not found" });
      return;
    }

    const workerPercent = body.workerPercentOverride !== undefined ? body.workerPercentOverride : Number(worker.workerPercent);
    const workerPaidExpenses = computeWorkerPaidTotal(expenseLines, worker.id);
    const workerShare = (net * workerPercent) / 100 + workerPaidExpenses;
    const workshopShare = net - workerShare;

    const [row] = await db
      .insert(jobsTable)
      .values({
        jobType: "single",
        workerId: body.workerId,
        cashReceivedByWorkerId,
        source: body.source,
        paymentMethod: body.paymentMethod,
        grossAmount: gross.toFixed(2),
        cardFeeAmount: vatAmount.toFixed(2),
        vatPaidByCustomer,
        expensesTotal: expensesTotal.toFixed(2),
        netAmount: net.toFixed(2),
        workerShare: workerShare.toFixed(2),
        workshopShare: workshopShare.toFixed(2),
        plateNumber: body.plateNumber ?? null,
        carModel: body.carModel ?? null,
        notes: body.notes,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      })
      .returning();

    let savedLines: ExpenseLine[] = [];
    if (expenseLines.length > 0 && row) {
      await db
        .insert(jobExpenseLinesTable)
        .values(expenseLines.map((l) => ({
          jobId: row.id,
          description: l.description,
          amount: l.amount.toFixed(2),
          paidByWorkerId: l.paidByWorkerId ?? null,
        })));
      savedLines = (await loadExpenseLines([row.id])).get(row.id) ?? [];
    }

    let cashReceivedByName: string | null = null;
    if (cashReceivedByWorkerId) {
      const [cw] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, cashReceivedByWorkerId));
      cashReceivedByName = cw?.name ?? null;
    }

    res.status(201).json(serialize(row!, worker.name, savedLines, [], cashReceivedByName));
    return;
  }

  // ── Shared job ─────────────────────────────────────────────────────────────
  const workerShareEntries = (body.workerShares ?? []).filter((s) => s.workerId);
  if (workerShareEntries.length === 0) {
    res.status(400).json({ error: "At least one worker is required for shared jobs" });
    return;
  }

  const workerIds = workerShareEntries.map((s) => s.workerId);
  const workers = await db
    .select()
    .from(workersTable)
    .where(inArray(workersTable.id, workerIds));
  const workerMap = new Map(workers.map((w) => [w.id, w]));

  const workerPoolRatio = body.workerPercentOverride !== undefined ? body.workerPercentOverride / 100 : 0.5;
  const workshopShare = net * (1 - workerPoolRatio);

  const adjustedShares = workerShareEntries.map((e) => {
    const workerPaid = computeWorkerPaidTotal(expenseLines, e.workerId);
    return { workerId: e.workerId, baseAmount: e.amount, finalAmount: (e.amount || 0) + workerPaid };
  });
  const totalWorkerShare = adjustedShares.reduce((s, e) => s + e.finalAmount, 0);

  const [row] = await db
    .insert(jobsTable)
    .values({
      jobType: "shared",
      workerId: null,
      cashReceivedByWorkerId,
      source: body.source,
      paymentMethod: body.paymentMethod,
      grossAmount: gross.toFixed(2),
      cardFeeAmount: vatAmount.toFixed(2),
      vatPaidByCustomer,
      expensesTotal: expensesTotal.toFixed(2),
      netAmount: net.toFixed(2),
      workerShare: totalWorkerShare.toFixed(2),
      workshopShare: workshopShare.toFixed(2),
      plateNumber: body.plateNumber ?? null,
      carModel: body.carModel ?? null,
      notes: body.notes,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    })
    .returning();

  let savedLines: ExpenseLine[] = [];
  if (expenseLines.length > 0 && row) {
    await db
      .insert(jobExpenseLinesTable)
      .values(expenseLines.map((l) => ({
        jobId: row.id,
        description: l.description,
        amount: l.amount.toFixed(2),
        paidByWorkerId: l.paidByWorkerId ?? null,
      })));
    savedLines = (await loadExpenseLines([row.id])).get(row.id) ?? [];
  }

  let savedShares: WorkerShareRow[] = [];
  if (row) {
    const inserted = await db
      .insert(jobWorkerSharesTable)
      .values(
        adjustedShares.map((e) => ({
          jobId: row.id,
          workerId: e.workerId,
          workerName: workerMap.get(e.workerId)?.name ?? "Unknown",
          amount: e.finalAmount.toFixed(2),
        })),
      )
      .returning();
    savedShares = inserted.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      workerId: r.workerId,
      workerName: r.workerName,
      amount: Number(r.amount),
    }));
  }

  let cashReceivedByName: string | null = null;
  if (cashReceivedByWorkerId) {
    const [cw] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, cashReceivedByWorkerId));
    cashReceivedByName = cw?.name ?? null;
  }

  res.status(201).json(serialize(row!, null, savedLines, savedShares, cashReceivedByName));
});

// ── PUT /jobs/:id/expenses — edit expense lines & recalculate payouts ──────
router.put("/jobs/:id/expenses", async (req, res) => {
  const jobId = Number(req.params.id);
  const body = UpdateJobExpensesBody.parse(req.body);
  const { expenseLines: rawLines } = body;

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  const expenseLines = rawLines.filter((l) => l.description && l.amount > 0);
  const expensesTotal = expenseLines.reduce((s, l) => s + l.amount, 0);

  // Use new values if provided, otherwise fall back to stored values
  const gross = body.grossAmount !== undefined ? body.grossAmount : Number(job.grossAmount);
  const paymentMethod = body.paymentMethod ?? job.paymentMethod;
  const vatPaidByCustomer = body.vatPaidByCustomer !== undefined ? body.vatPaidByCustomer : job.vatPaidByCustomer;

  let vatAmount = 0;
  let vatDeducted = 0;
  if (paymentMethod === "card") {
    const settings = await ensureSettings();
    vatAmount = (gross * Number(settings.cardFeePercent)) / 100;
    // Case 1 (vatPaidByCustomer = true): customer paid VAT on top — net keeps full gross
    // Case 2 (vatPaidByCustomer = false): VAT included in gross — deduct it from net
    vatDeducted = vatPaidByCustomer ? 0 : vatAmount;
  }

  const net = Math.max(0, gross - vatDeducted - expensesTotal);

  let workerShare: number;
  let workshopShare: number;

  if (job.jobType === "single" && job.workerId) {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, job.workerId));
    const workerPercent = Number(worker?.workerPercent ?? 50);
    const workerPaid = computeWorkerPaidTotal(expenseLines, job.workerId);
    workerShare = (net * workerPercent) / 100 + workerPaid;
    workshopShare = net - workerShare;
  } else {
    const shares = await db.select().from(jobWorkerSharesTable).where(eq(jobWorkerSharesTable.jobId, jobId));
    workshopShare = net * 0.5;
    const newPool = net * 0.5;

    const oldExpenseLines = await db.select().from(jobExpenseLinesTable).where(eq(jobExpenseLinesTable.jobId, jobId));
    const oldExpenses = oldExpenseLines.map((l) => ({
      paidByWorkerId: l.paidByWorkerId,
      amount: Number(l.amount),
    }));

    const sharesWithBase = shares.map((s) => {
      const oldReimb = computeWorkerPaidTotal(oldExpenses, s.workerId);
      return { ...s, base: Math.max(0, Number(s.amount) - oldReimb) };
    });
    const oldTotalBase = sharesWithBase.reduce((sum, s) => sum + s.base, 0);

    for (const share of sharesWithBase) {
      const proportion = oldTotalBase > 0 ? share.base / oldTotalBase : 1 / shares.length;
      const newBase = newPool * proportion;
      const workerPaid = computeWorkerPaidTotal(expenseLines, share.workerId);
      const newAmount = newBase + workerPaid;
      await db
        .update(jobWorkerSharesTable)
        .set({ amount: newAmount.toFixed(2) })
        .where(eq(jobWorkerSharesTable.id, share.id));
    }

    workerShare = sharesWithBase.reduce((s, share) => {
      const proportion = oldTotalBase > 0 ? share.base / oldTotalBase : 1 / shares.length;
      const newBase = newPool * proportion;
      const workerPaid = computeWorkerPaidTotal(expenseLines, share.workerId);
      return s + newBase + workerPaid;
    }, 0);
  }

  await db.delete(jobExpenseLinesTable).where(eq(jobExpenseLinesTable.jobId, jobId));

  if (expenseLines.length > 0) {
    await db.insert(jobExpenseLinesTable).values(
      expenseLines.map((l) => ({
        jobId,
        description: l.description,
        amount: l.amount.toFixed(2),
        paidByWorkerId: l.paidByWorkerId ?? null,
      })),
    );
  }

  const updatePayload: Partial<typeof jobsTable.$inferInsert> = {
    expensesTotal: expensesTotal.toFixed(2),
    netAmount: net.toFixed(2),
    workerShare: workerShare.toFixed(2),
    workshopShare: workshopShare.toFixed(2),
    cardFeeAmount: vatAmount.toFixed(2),
    vatPaidByCustomer,
    paymentMethod,
    grossAmount: gross.toFixed(2),
  };
  if (body.source !== undefined) updatePayload.source = body.source;
  if (body.plateNumber !== undefined) updatePayload.plateNumber = body.plateNumber ?? null;
  if (body.carModel !== undefined) updatePayload.carModel = body.carModel ?? null;
  if (body.occurredAt !== undefined) updatePayload.occurredAt = new Date(body.occurredAt);

  const [updated] = await db
    .update(jobsTable)
    .set(updatePayload)
    .where(eq(jobsTable.id, jobId))
    .returning();

  const [workerName] = job.workerId
    ? await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, job.workerId))
    : [null];

  let cashReceivedByName: string | null = null;
  if (updated?.cashReceivedByWorkerId) {
    const [cw] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, updated.cashReceivedByWorkerId));
    cashReceivedByName = cw?.name ?? null;
  }

  const savedLines = (await loadExpenseLines([jobId])).get(jobId) ?? [];
  const savedShares = (await loadWorkerShares([jobId])).get(jobId) ?? [];

  res.json(serialize(updated!, workerName?.name ?? null, savedLines, savedShares, cashReceivedByName));
});

router.delete("/jobs/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(jobsTable).where(eq(jobsTable.id, id));
  res.status(204).end();
});

// ── PATCH /jobs/:id/status — admin approves or rejects a pending submission ──
router.patch("/jobs/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status?: string };
  if (!status || !["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    return;
  }
  const [updated] = await db
    .update(jobsTable)
    .set({ status })
    .where(eq(jobsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Job not found" }); return; }

  const workerName = updated.workerId
    ? (await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, updated.workerId)))[0]?.name ?? null
    : null;
  const expenseLines = (await loadExpenseLines([id])).get(id) ?? [];
  const workerShares = (await loadWorkerShares([id])).get(id) ?? [];
  let cashName: string | null = null;
  if (updated.cashReceivedByWorkerId) {
    cashName = (await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, updated.cashReceivedByWorkerId)))[0]?.name ?? null;
  }
  res.json(serialize(updated, workerName, expenseLines, workerShares, cashName));
});

export default router;
