import { Router, type IRouter } from "express";
import { db, jobsTable, workersTable, jobExpenseLinesTable, jobWorkerSharesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureSettings } from "./settings";
import * as z from "zod";

const router: IRouter = Router();

const PortalSubmitJobBody = z.object({
  source: z.string().min(1),
  grossAmount: z.number().positive(),
  paymentMethod: z.enum(["cash", "card"]),
  vatPaidByCustomer: z.boolean().optional().default(true),
  cashReceivedByWorker: z.boolean().optional().default(true),
  occurredAt: z.string().optional(),
  plateNumber: z.string().optional(),
  carModel: z.string().optional(),
  notes: z.string().optional(),
  jobType: z.enum(["single", "shared"]).default("single"),
  workerShares: z
    .array(
      z.object({
        workerId: z.number(),
        amount: z.number().min(0),
      }),
    )
    .optional()
    .default([]),
  expenseLines: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number().min(0),
        paidBy: z.enum(["worker", "workshop"]).optional().default("workshop"),
        paidByWorkerId: z.number().nullish(),
      }),
    )
    .optional()
    .default([]),
});

function computeWorkerPaidTotal(
  expenseLines: Array<{ paidByWorkerId?: number | null; amount: number }>,
  workerId: number,
) {
  return expenseLines
    .filter((l) => l.paidByWorkerId === workerId)
    .reduce((s, l) => s + l.amount, 0);
}

// POST /api/portal/jobs — worker submits a pending job
router.post("/portal/jobs", async (req, res) => {
  const workerId = req.session.workerId;
  if (!workerId) {
    res.status(403).json({ error: "Only workers can submit portal jobs" });
    return;
  }

  const body = PortalSubmitJobBody.parse(req.body);

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, workerId));
  if (!worker) {
    res.status(400).json({ error: "Worker not found" });
    return;
  }

  const settings = await ensureSettings();
  const cardFeePercent = Number(settings.cardFeePercent);

  const gross = body.grossAmount;
  const isCard = body.paymentMethod === "card";
  const vatPaidByCustomer = body.vatPaidByCustomer;
  const vatAmount = isCard ? (gross * cardFeePercent) / 100 : 0;
  const vatDeducted = isCard && !vatPaidByCustomer ? vatAmount : 0;

  const expenseLines = (body.expenseLines ?? []).filter((l) => l.description && l.amount > 0);
  const expensesTotal = expenseLines.reduce((s, l) => s + l.amount, 0);
  const net = Math.max(0, gross - vatDeducted - expensesTotal);

  // Cash receiver
  const cashReceivedByWorkerId = !isCard && body.cashReceivedByWorker ? workerId : null;

  let jobRow: typeof jobsTable.$inferSelect;

  if (body.jobType === "shared" && (body.workerShares ?? []).length > 0) {
    // ── Shared job ────────────────────────────────────────────────────────
    const workshopShare = net * 0.5;

    // Map each workerShare entry → add their expense reimbursements
    const enrichedShares = (body.workerShares ?? []).map((s) => {
      const expLinesForCalc = expenseLines.map((l) => ({
        paidByWorkerId: l.paidBy === "worker" && l.paidByWorkerId === s.workerId
          ? s.workerId
          : l.paidBy === "worker" && s.workerId === workerId && l.paidByWorkerId == null
          ? workerId
          : null,
        amount: l.amount,
      }));
      const workerPaid = computeWorkerPaidTotal(expLinesForCalc, s.workerId);
      return { workerId: s.workerId, baseAmount: s.amount, finalAmount: s.amount + workerPaid };
    });
    const totalWorkerShare = enrichedShares.reduce((s, e) => s + e.finalAmount, 0);

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
        notes: body.notes ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        status: "pending",
        submittedByWorkerId: workerId,
      })
      .returning();

    jobRow = row!;

    // Insert worker share rows
    const workerNames = await db.select({ id: workersTable.id, name: workersTable.name })
      .from(workersTable);
    const nameMap = new Map(workerNames.map((w) => [w.id, w.name]));

    if (enrichedShares.length > 0) {
      await db.insert(jobWorkerSharesTable).values(
        enrichedShares.map((e) => ({
          jobId: row!.id,
          workerId: e.workerId,
          workerName: nameMap.get(e.workerId) ?? "Unknown",
          amount: e.finalAmount.toFixed(2),
        })),
      );
    }
  } else {
    // ── Single job (default) ──────────────────────────────────────────────
    const workerPercent = Number(worker.workerPercent);
    const workerPaidExpenses = expenseLines
      .filter((l) => l.paidBy === "worker")
      .reduce((s, l) => s + l.amount, 0);
    const workerShare = (net * workerPercent) / 100 + workerPaidExpenses;
    const workshopShare = net - workerShare;

    const [row] = await db
      .insert(jobsTable)
      .values({
        jobType: "single",
        workerId: workerId,
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
        notes: body.notes ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        status: "pending",
        submittedByWorkerId: workerId,
      })
      .returning();

    jobRow = row!;
  }

  if (expenseLines.length > 0) {
    await db.insert(jobExpenseLinesTable).values(
      expenseLines.map((l) => ({
        jobId: jobRow.id,
        description: l.description,
        amount: l.amount.toFixed(2),
        paidByWorkerId: l.paidBy === "worker" ? workerId : null,
      })),
    );
  }

  res.status(201).json({
    id: jobRow.id,
    source: jobRow.source,
    grossAmount: Number(jobRow.grossAmount),
    workerShare: Number(jobRow.workerShare),
    status: jobRow.status,
    occurredAt: jobRow.occurredAt.toISOString(),
  });
});

// GET /api/portal/jobs — worker gets their own jobs (all statuses)
router.get("/portal/jobs", async (req, res) => {
  const workerId = req.session.workerId;
  if (!workerId) {
    res.status(403).json({ error: "Not a worker account" });
    return;
  }

  const rows = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.submittedByWorkerId, workerId));

  res.json(
    rows.map((j) => ({
      id: j.id,
      source: j.source,
      grossAmount: Number(j.grossAmount),
      workerShare: Number(j.workerShare),
      paymentMethod: j.paymentMethod,
      status: j.status,
      occurredAt: j.occurredAt.toISOString(),
      notes: j.notes,
    })),
  );
});

export default router;
