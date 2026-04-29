import { Router, type IRouter } from "express";
import { db, workersTable, jobsTable, expensesTable, jobExpenseLinesTable, jobWorkerSharesTable, workerPaymentsTable, workerAdjustmentsTable, workerTransfersTable, workerDebtsTable } from "@workspace/db";
import { eq, sum, count, and, gte, lte, or, desc } from "drizzle-orm";
import {
  CreateWorkerBody,
  UpdateWorkerBody,
  CreateWorkerTransferBody,
  CreateWorkerDebtBody,
  UpdateWorkerDebtBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeWorker(w: typeof workersTable.$inferSelect) {
  return {
    id: w.id,
    name: w.name,
    workerPercent: Number(w.workerPercent),
    workshopPercent: Number(w.workshopPercent),
    equityPercent: Number(w.equityPercent),
    active: w.active,
    createdAt: w.createdAt.toISOString(),
    attendanceMode: w.attendanceMode ?? "required",
  };
}

router.get("/workers", async (_req, res) => {
  const rows = await db
    .select()
    .from(workersTable)
    .orderBy(workersTable.id);
  res.json(rows.map(serializeWorker));
});

router.post("/workers", async (req, res) => {
  const body = CreateWorkerBody.parse(req.body);
  const [row] = await db
    .insert(workersTable)
    .values({
      name: body.name,
      workerPercent: body.workerPercent?.toString() ?? "50",
      workshopPercent: body.workshopPercent?.toString() ?? "50",
      equityPercent: body.equityPercent?.toString() ?? "0",
    })
    .returning();
  res.status(201).json(serializeWorker(row!));
});

router.get("/workers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Earnings from single jobs
  const [singleEarnings] = await db
    .select({ total: sum(jobsTable.workerShare), count: count(jobsTable.id) })
    .from(jobsTable)
    .where(eq(jobsTable.workerId, id));

  // Earnings from shared jobs
  const [sharedEarnings] = await db
    .select({ total: sum(jobWorkerSharesTable.amount) })
    .from(jobWorkerSharesTable)
    .where(eq(jobWorkerSharesTable.workerId, id));

  // Cash collected by this worker (the full gross amounts they received from customers)
  const [cashCollected] = await db
    .select({ total: sum(jobsTable.grossAmount) })
    .from(jobsTable)
    .where(eq(jobsTable.cashReceivedByWorkerId, id));

  // Expense lines paid out of pocket by this worker (reimbursements owed to them)
  const [reimbursements] = await db
    .select({ total: sum(jobExpenseLinesTable.amount) })
    .from(jobExpenseLinesTable)
    .where(eq(jobExpenseLinesTable.paidByWorkerId, id));

  // Advances / workshop expenses tied to this worker (deductions)
  const [exp] = await db
    .select({ total: sum(expensesTable.amount) })
    .from(expensesTable)
    .where(eq(expensesTable.workerId, id));

  // Worker-to-worker transfers (always unfiltered for all-time balance)
  const transfers = await db.select().from(workerTransfersTable)
    .where(or(eq(workerTransfersTable.fromWorkerId, id), eq(workerTransfersTable.toWorkerId, id)));
  const transferNet = transfers.reduce((s, t) => {
    if (t.fromWorkerId === id) return s + Number(t.amount);
    if (t.toWorkerId === id) return s - Number(t.amount);
    return s;
  }, 0);

  // Uncollected worker debts reduce the net balance
  const debts = await db.select().from(workerDebtsTable)
    .where(and(eq(workerDebtsTable.workerId, id), eq(workerDebtsTable.collected, false)));
  const totalDebts = debts.reduce((s, d) => s + Number(d.amount), 0);

  // Worker payments (use abs to match ledger endpoint)
  const payments = await db.select().from(workerPaymentsTable).where(eq(workerPaymentsTable.workerId, id));
  const totalPayments = payments.reduce((s, p) => s + Math.abs(Number(p.amount)), 0);

  const totalEarned = Number(singleEarnings?.total ?? 0) + Number(sharedEarnings?.total ?? 0);
  const totalCashCollected = Number(cashCollected?.total ?? 0);
  const totalReimbursements = Number(reimbursements?.total ?? 0);
  const totalExpenses = Number(exp?.total ?? 0);
  // Net: workshop owes worker (positive = owed, negative = worker owes workshop)
  const netBalance = totalEarned + totalReimbursements - totalCashCollected - totalExpenses - totalDebts + transferNet;

  res.json({
    ...serializeWorker(row),
    totalEarned,
    totalCashCollected,
    totalReimbursements,
    totalExpenses,
    netBalance,
    jobCount: Number(singleEarnings?.count ?? 0),
  });
});

router.get("/workers/:id/ledger", async (req, res) => {
  const id = Number(req.params.id);
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, id));
  if (!worker) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const fromDate = req.query.from ? new Date(req.query.from as string) : null;
  const toDate = req.query.to ? new Date(req.query.to as string) : null;
  // Extend toDate to end of day
  if (toDate) toDate.setHours(23, 59, 59, 999);

  type LedgerEntry = {
    id: string;
    date: string;
    type: "job_earned" | "cash_collected" | "expense_reimbursement" | "advance_deduction" | "worker_payment";
    paid?: boolean;
    label: string;
    amount: number;
    jobId: number | null;
    sign: 1 | -1;
  };

  const entries: LedgerEntry[] = [];

  // ── 1. Single-worker jobs earned ─────────────────────────────────────────
  const singleConds = [eq(jobsTable.workerId, id), eq(jobsTable.status, "approved")];
  if (fromDate) singleConds.push(gte(jobsTable.occurredAt, fromDate));
  if (toDate) singleConds.push(lte(jobsTable.occurredAt, toDate));

  const singleJobs = await db.select().from(jobsTable).where(and(...singleConds));
  for (const j of singleJobs) {
    entries.push({
      id: `job-earned-${j.id}`,
      date: j.occurredAt.toISOString(),
      type: "job_earned",
      label: `${j.source} — Earned`,
      amount: Number(j.workerShare),
      jobId: j.id,
      sign: 1,
      paid: j.workerPaid,
    });
  }

  // ── 2. Shared jobs — worker shares ───────────────────────────────────────
  const sharedShareRows = await db
    .select({ share: jobWorkerSharesTable, job: jobsTable })
    .from(jobWorkerSharesTable)
    .innerJoin(jobsTable, eq(jobWorkerSharesTable.jobId, jobsTable.id))
    .where(
      and(
        eq(jobWorkerSharesTable.workerId, id),
        eq(jobsTable.status, "approved"),
        ...(fromDate ? [gte(jobsTable.occurredAt, fromDate)] : []),
        ...(toDate ? [lte(jobsTable.occurredAt, toDate)] : []),
      ),
    );
  for (const { share, job } of sharedShareRows) {
    entries.push({
      id: `shared-${share.id}`,
      date: job.occurredAt.toISOString(),
      type: "job_earned",
      label: `${job.source} — Earned (shared)`,
      amount: Number(share.amount),
      jobId: job.id,
      sign: 1,
      paid: share.paid,
    });
  }

  // ── 3. Cash collected by this worker ─────────────────────────────────────
  const cashConds = [eq(jobsTable.cashReceivedByWorkerId, id), eq(jobsTable.status, "approved")];
  if (fromDate) cashConds.push(gte(jobsTable.occurredAt, fromDate));
  if (toDate) cashConds.push(lte(jobsTable.occurredAt, toDate));

  const cashJobs = await db.select().from(jobsTable).where(and(...cashConds));
  for (const j of cashJobs) {
    entries.push({
      id: `cash-${j.id}`,
      date: j.occurredAt.toISOString(),
      type: "cash_collected",
      label: `${j.source} — Cash received`,
      amount: Number(j.grossAmount),
      jobId: j.id,
      sign: -1,
    });
  }

  // ── 4. Job expense lines paid out of pocket (reimbursements) ─────────────
  const reimbRows = await db
    .select({ line: jobExpenseLinesTable, job: jobsTable })
    .from(jobExpenseLinesTable)
    .innerJoin(jobsTable, eq(jobExpenseLinesTable.jobId, jobsTable.id))
    .where(
      and(
        eq(jobExpenseLinesTable.paidByWorkerId, id),
        eq(jobsTable.status, "approved"),
        ...(fromDate ? [gte(jobsTable.occurredAt, fromDate)] : []),
        ...(toDate ? [lte(jobsTable.occurredAt, toDate)] : []),
      ),
    );
  for (const { line, job } of reimbRows) {
    entries.push({
      id: `reimb-${line.id}`,
      date: job.occurredAt.toISOString(),
      type: "expense_reimbursement",
      label: `${line.description} (${job.source}) — Expense paid`,
      amount: Number(line.amount),
      jobId: job.id,
      sign: 1,
    });
  }

  // ── 5. Workshop expenses / advances tied to this worker ──────────────────
  const advConds = [eq(expensesTable.workerId, id)];
  if (fromDate) advConds.push(gte(expensesTable.occurredAt, fromDate));
  if (toDate) advConds.push(lte(expensesTable.occurredAt, toDate));

  const workerExpenses = await db.select().from(expensesTable).where(and(...advConds));
  for (const e of workerExpenses) {
    // Worker paid this expense from their own pocket — workshop must reimburse them (positive)
    entries.push({
      id: `exp-${e.id}`,
      date: e.occurredAt.toISOString(),
      type: "expense_reimbursement",
      label: `${e.description} — ${e.category}`,
      amount: Number(e.amount),
      jobId: null,
      sign: 1,
    });
  }

  // ── 6. Worker adjustments (reimbursements & deductions) ─────────────────
  const adjConds = [eq(workerAdjustmentsTable.workerId, id)];
  if (fromDate) adjConds.push(gte(workerAdjustmentsTable.occurredAt, fromDate));
  if (toDate) adjConds.push(lte(workerAdjustmentsTable.occurredAt, toDate));

  const adjustments = await db.select().from(workerAdjustmentsTable).where(and(...adjConds));
  for (const adj of adjustments) {
    const isReimb = adj.type === "reimbursement";
    entries.push({
      id: `adj-${adj.id}`,
      date: adj.occurredAt.toISOString(),
      type: isReimb ? "expense_reimbursement" : "advance_deduction",
      label: adj.description,
      amount: Number(adj.amount),
      jobId: null,
      sign: isReimb ? 1 : -1,
    });
  }

  // ── 7. Worker debts (uncollected only affect worker balance) ─────────────
  const debtConds = [eq(workerDebtsTable.workerId, id)];
  if (fromDate) debtConds.push(gte(workerDebtsTable.occurredAt, fromDate));
  if (toDate) debtConds.push(lte(workerDebtsTable.occurredAt, toDate));
  const debts = await db.select().from(workerDebtsTable).where(and(...debtConds));
  for (const d of debts) {
    if (!d.collected) {
      entries.push({
        id: `debt-${d.id}`,
        date: d.occurredAt.toISOString(),
        type: "worker_debt",
        label: d.description,
        amount: Number(d.amount),
        jobId: null,
        sign: -1,
      });
    }
  }

  // ── 8. Worker-to-worker transfers ────────────────────────────────────────
  const transferConds = [
    or(
      eq(workerTransfersTable.fromWorkerId, id),
      eq(workerTransfersTable.toWorkerId, id),
    )!,
  ];
  if (fromDate) {
    transferConds.push(gte(workerTransfersTable.occurredAt, fromDate));
  }
  if (toDate) {
    transferConds.push(lte(workerTransfersTable.occurredAt, toDate));
  }
  const transfers = await db
    .select({
      transfer: workerTransfersTable,
      fromName: { name: workersTable.name },
    })
    .from(workerTransfersTable)
    .leftJoin(workersTable, eq(workerTransfersTable.fromWorkerId, workersTable.id))
    .where(and(...transferConds));

  for (const { transfer, fromName } of transfers) {
    const isSender = transfer.fromWorkerId === id;
    // Load the other worker's name
    const otherWorkerId = isSender ? transfer.toWorkerId : transfer.fromWorkerId;
    const [otherW] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, otherWorkerId));
    const otherName = otherW?.name ?? "—";
    entries.push({
      id: `transfer-${transfer.id}`,
      date: transfer.occurredAt.toISOString(),
      type: isSender ? "transfer_sent" : "transfer_received",
      label: isSender
        ? `${transfer.note ? transfer.note + " · " : ""}→ ${otherName}`
        : `${transfer.note ? transfer.note + " · " : ""}← ${otherName}`,
      amount: Number(transfer.amount),
      jobId: null,
      sign: isSender ? 1 : -1, // sender is relieved of debt (+), receiver takes on debt (-)
    });
  }

  // ── 8. Actual cash payments made to this worker ───────────────────────────
  // NOTE: We load ALL payments (no date filter) so remaining balance is always accurate,
  // but only include them as ledger entries when they fall within the selected period.
  const allPayments = await db
    .select()
    .from(workerPaymentsTable)
    .where(eq(workerPaymentsTable.workerId, id));

  // Both positive (shop → worker) and negative (worker → shop) payments reduce remaining.
  // Negative payments are debts the worker owes the shop; use abs so they also reduce what we owe them.
  const totalWorkerPayments = allPayments.reduce((s, p) => s + Math.abs(Number(p.amount)), 0);

  // Add payments that fall within the requested period as ledger entries
  for (const p of allPayments) {
    const pDate = p.paidAt;
    if (fromDate && pDate < fromDate) continue;
    if (toDate && pDate > toDate) continue;
    const amt = Number(p.amount);
    const isNegative = amt < 0;
    entries.push({
      id: `payment-${p.id}`,
      date: p.paidAt.toISOString(),
      type: isNegative ? "worker_owes" : "worker_payment",
      label: p.note ? `${p.note}` : (isNegative ? "Worker → Workshop" : "Worker payment"),
      amount: Math.abs(amt),
      jobId: null,
      sign: -1,
      paid: p.paid ?? true,
    });
  }

  // Sort by date descending
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Totals
  const totalEarned = entries.filter((e) => e.type === "job_earned").reduce((s, e) => s + e.amount, 0);
  const totalCashCollected = entries.filter((e) => e.type === "cash_collected").reduce((s, e) => s + e.amount, 0);
  const totalReimbursements = entries.filter((e) => e.type === "expense_reimbursement").reduce((s, e) => s + e.amount, 0);
  const totalDeductions = entries.filter((e) => e.type === "advance_deduction").reduce((s, e) => s + e.amount, 0);
  const totalTransfers = entries
    .filter((e) => e.type === "transfer_sent" || e.type === "transfer_received")
    .reduce((s, e) => s + e.amount * e.sign, 0);
  const totalWorkerDebts = entries
    .filter((e) => e.type === "worker_debt")
    .reduce((s, e) => s + e.amount, 0);
  const netBalance = totalEarned + totalReimbursements - totalCashCollected - totalDeductions - totalWorkerDebts + totalTransfers;

  // Remaining balance = what workshop still owes worker (net earned - cash already paid to worker)
  const remainingBalance = netBalance - totalWorkerPayments;

  res.json({
    workerId: worker.id,
    workerName: worker.name,
    from: fromDate?.toISOString() ?? null,
    to: toDate?.toISOString() ?? null,
    entries,
    totalEarned,
    totalCashCollected,
    totalReimbursements,
    totalDeductions,
    netBalance,
    remainingBalance,
  });
});

router.put("/workers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = UpdateWorkerBody.parse(req.body);
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update["name"] = body.name;
  if (body.workerPercent !== undefined)
    update["workerPercent"] = body.workerPercent.toString();
  if (body.workshopPercent !== undefined)
    update["workshopPercent"] = body.workshopPercent.toString();
  if (body.equityPercent !== undefined)
    update["equityPercent"] = body.equityPercent.toString();
  if (body.active !== undefined) update["active"] = body.active;
  const [row] = await db
    .update(workersTable)
    .set(update)
    .where(eq(workersTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeWorker(row));
});

router.delete("/workers/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await db.delete(workersTable).where(eq(workersTable.id, id));
    res.status(204).end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(409).json({ error: "Cannot delete worker — they may have associated records.", detail: msg });
  }
});

// ── POST /workers/:id/payments — record a cash payment to the worker ────────
router.post("/workers/:id/payments", async (req, res) => {
  const id = Number(req.params.id);
  const { amount, note, paidByWorkerId } = req.body as { amount?: number; note?: string; paidByWorkerId?: number };
  if (amount === undefined || amount === null || isNaN(Number(amount)) || amount === 0) {
    res.status(400).json({ error: "amount must be a non-zero number (negative = worker owes shop)" });
    return;
  }
  // Negative amount = worker owes shop; default paid=false so checkbox is unchecked
  const defaultPaid = amount > 0;
  const [row] = await db
    .insert(workerPaymentsTable)
    .values({ workerId: id, amount: Number(amount).toFixed(2), note: note ?? null, paid: defaultPaid })
    .returning();

  // If another worker paid on behalf of this worker, create a reimbursement adjustment for them
  if (paidByWorkerId && paidByWorkerId !== id && amount > 0) {
    const payerRow = await db.select().from(workersTable).where(eq(workersTable.id, id)).limit(1);
    const payeeName = payerRow[0]?.name ?? `Worker #${id}`;
    await db.insert(workerAdjustmentsTable).values({
      workerId: paidByWorkerId,
      type: "reimbursement",
      amount: Math.abs(Number(amount)).toFixed(2),
      description: note ? `${note} (نيابة عن / on behalf of ${payeeName})` : `دفع نيابة عن / Paid on behalf of ${payeeName}`,
      occurredAt: new Date(),
    });
  }

  res.status(201).json({ id: row!.id, workerId: id, amount: Number(row!.amount), note: row!.note, paid: row!.paid, paidAt: row!.paidAt.toISOString() });
});

router.delete("/workers/:id/payments/:paymentId", async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const [row] = await db
    .delete(workerPaymentsTable)
    .where(eq(workerPaymentsTable.id, paymentId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  res.json({ ok: true });
});

router.patch("/workers/:id/ledger-payment", async (req, res) => {
  const { entryId, paid } = req.body as { entryId?: string; paid?: boolean };
  if (!entryId || paid === undefined) {
    res.status(400).json({ error: "entryId and paid are required" });
    return;
  }

  if (entryId.startsWith("job-earned-")) {
    const jobId = Number(entryId.replace("job-earned-", ""));
    const [row] = await db
      .update(jobsTable)
      .set({ workerPaid: paid })
      .where(eq(jobsTable.id, jobId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ ok: true, paid: row.workerPaid });
  } else if (entryId.startsWith("shared-")) {
    const shareId = Number(entryId.replace("shared-", ""));
    const [row] = await db
      .update(jobWorkerSharesTable)
      .set({ paid })
      .where(eq(jobWorkerSharesTable.id, shareId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Share not found" });
      return;
    }
    res.json({ ok: true, paid: row.paid });
  } else if (entryId.startsWith("payment-")) {
    const paymentId = Number(entryId.replace("payment-", ""));
    const [row] = await db
      .update(workerPaymentsTable)
      .set({ paid })
      .where(eq(workerPaymentsTable.id, paymentId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    res.json({ ok: true, paid: row.paid });
  } else {
    res.status(400).json({ error: "Invalid entryId format" });
  }
});

// ── Worker Adjustments CRUD ────────────────────────────────────────────────

router.get("/workers/:id/adjustments", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(workerAdjustmentsTable)
    .where(eq(workerAdjustmentsTable.workerId, id))
    .orderBy(workerAdjustmentsTable.occurredAt);
  res.json(rows.map((r) => ({
    id: r.id,
    workerId: r.workerId,
    type: r.type,
    amount: Number(r.amount),
    description: r.description,
    occurredAt: r.occurredAt.toISOString(),
  })));
});

router.post("/workers/:id/adjustments", async (req, res) => {
  const workerId = Number(req.params.id);
  const { type, amount, description, occurredAt } = req.body as {
    type: string; amount: number; description: string; occurredAt?: string;
  };
  if (!type || !amount || !description) {
    res.status(400).json({ error: "type, amount and description are required" });
    return;
  }
  const [row] = await db
    .insert(workerAdjustmentsTable)
    .values({
      workerId,
      type,
      amount: amount.toString(),
      description,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    })
    .returning();
  res.status(201).json({
    id: row!.id,
    workerId: row!.workerId,
    type: row!.type,
    amount: Number(row!.amount),
    description: row!.description,
    occurredAt: row!.occurredAt.toISOString(),
  });
});

router.put("/workers/:id/adjustments/:adjId", async (req, res) => {
  const adjId = Number(req.params.adjId);
  const { type, amount, description, occurredAt } = req.body as {
    type?: string; amount?: number; description?: string; occurredAt?: string;
  };
  const update: Record<string, unknown> = {};
  if (type !== undefined) update.type = type;
  if (amount !== undefined) update.amount = amount.toString();
  if (description !== undefined) update.description = description;
  if (occurredAt !== undefined) update.occurredAt = new Date(occurredAt);

  const [row] = await db
    .update(workerAdjustmentsTable)
    .set(update)
    .where(eq(workerAdjustmentsTable.id, adjId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Adjustment not found" });
    return;
  }
  res.json({
    id: row.id,
    workerId: row.workerId,
    type: row.type,
    amount: Number(row.amount),
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
  });
});

router.delete("/workers/:id/adjustments/:adjId", async (req, res) => {
  const adjId = Number(req.params.adjId);
  await db.delete(workerAdjustmentsTable).where(eq(workerAdjustmentsTable.id, adjId));
  res.json({ ok: true });
});

// ── Debt CRUD ──────────────────────────────────────────────────────────────
function serializeDebt(d: typeof workerDebtsTable.$inferSelect) {
  return {
    id: d.id,
    workerId: d.workerId,
    amount: Number(d.amount),
    description: d.description,
    collected: d.collected,
    collectedAt: d.collectedAt?.toISOString() ?? null,
    occurredAt: d.occurredAt.toISOString(),
  };
}

router.get("/workers/:id/debts", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(workerDebtsTable)
    .where(eq(workerDebtsTable.workerId, id))
    .orderBy(desc(workerDebtsTable.occurredAt));
  res.json(rows.map(serializeDebt));
});

router.post("/workers/:id/debts", async (req, res) => {
  const id = Number(req.params.id);
  const body = CreateWorkerDebtBody.parse(req.body);
  const [row] = await db
    .insert(workerDebtsTable)
    .values({
      workerId: id,
      amount: body.amount.toFixed(2),
      description: body.description,
      collected: false,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    })
    .returning();
  res.status(201).json(serializeDebt(row!));
});

router.put("/workers/:id/debts/:debtId", async (req, res) => {
  const debtId = Number(req.params.debtId);
  const body = UpdateWorkerDebtBody.parse(req.body);
  const update: Record<string, unknown> = {};
  if (body.amount !== undefined) update.amount = body.amount.toFixed(2);
  if (body.description !== undefined) update.description = body.description;
  if (body.collected !== undefined) {
    update.collected = body.collected;
    update.collectedAt = body.collected ? new Date() : null;
  }
  if (body.occurredAt !== undefined) update.occurredAt = new Date(body.occurredAt);
  const [row] = await db
    .update(workerDebtsTable)
    .set(update)
    .where(eq(workerDebtsTable.id, debtId))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeDebt(row));
});

router.delete("/workers/:id/debts/:debtId", async (req, res) => {
  const debtId = Number(req.params.debtId);
  await db.delete(workerDebtsTable).where(eq(workerDebtsTable.id, debtId));
  res.status(204).end();
});

// ── GET /workers/transfers — list all transfers ────────────────────────────
router.get("/workers/transfers", async (_req, res) => {
  const rows = await db
    .select()
    .from(workerTransfersTable)
    .orderBy(desc(workerTransfersTable.occurredAt));

  const result = await Promise.all(
    rows.map(async (t) => {
      const [from] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, t.fromWorkerId));
      const [to] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, t.toWorkerId));
      return {
        id: t.id,
        fromWorkerId: t.fromWorkerId,
        fromWorkerName: from?.name ?? "—",
        toWorkerId: t.toWorkerId,
        toWorkerName: to?.name ?? "—",
        amount: Number(t.amount),
        note: t.note ?? null,
        occurredAt: t.occurredAt.toISOString(),
      };
    }),
  );
  res.json(result);
});

// ── POST /workers/transfers — create a transfer ───────────────────────────
router.post("/workers/transfers", async (req, res) => {
  const body = CreateWorkerTransferBody.parse(req.body);
  if (body.fromWorkerId === body.toWorkerId) {
    res.status(400).json({ error: "fromWorkerId and toWorkerId must differ" });
    return;
  }
  const [row] = await db
    .insert(workerTransfersTable)
    .values({
      fromWorkerId: body.fromWorkerId,
      toWorkerId: body.toWorkerId,
      amount: body.amount.toFixed(2),
      note: body.note ?? null,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
    })
    .returning();
  const [from] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, row!.fromWorkerId));
  const [to] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, row!.toWorkerId));
  res.status(201).json({
    id: row!.id,
    fromWorkerId: row!.fromWorkerId,
    fromWorkerName: from?.name ?? "—",
    toWorkerId: row!.toWorkerId,
    toWorkerName: to?.name ?? "—",
    amount: Number(row!.amount),
    note: row!.note ?? null,
    occurredAt: row!.occurredAt.toISOString(),
  });
});

// ── DELETE /workers/transfers/:id ─────────────────────────────────────────
router.delete("/workers/transfers/:transferId", async (req, res) => {
  const transferId = Number(req.params.transferId);
  await db.delete(workerTransfersTable).where(eq(workerTransfersTable.id, transferId));
  res.status(204).end();
});

export default router;
