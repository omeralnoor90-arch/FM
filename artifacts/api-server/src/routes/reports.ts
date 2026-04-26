import { Router, type IRouter } from "express";
import {
  db,
  jobsTable,
  expensesTable,
  partsTable,
  workersTable,
  jobAttachmentsTable,
  jobWorkerSharesTable,
  workerPaymentsTable,
  workerAdjustmentsTable,
  jobExpenseLinesTable,
  workerTransfersTable,
  workerDebtsTable,
} from "@workspace/db";
import { eq, gte, lte, and, desc, inArray } from "drizzle-orm";

const router: IRouter = Router();

function attachmentDownloadPath(objectPath: string) {
  const trimmed = objectPath.replace(/^\/objects\//, "").replace(/^\//, "");
  return `/api/storage/objects/${trimmed}`;
}

router.get("/reports", async (req, res) => {
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;
  if (to) to.setHours(23, 59, 59, 999);

  // ── 1. Jobs (period-scoped, approved only) ────────────────────────────
  const jobConds = [eq(jobsTable.status, "approved")];
  if (from) jobConds.push(gte(jobsTable.occurredAt, from));
  if (to) jobConds.push(lte(jobsTable.occurredAt, to));

  const jobs = await db
    .select({ job: jobsTable, workerName: workersTable.name })
    .from(jobsTable)
    .leftJoin(workersTable, eq(jobsTable.workerId, workersTable.id))
    .where(and(...jobConds))
    .orderBy(desc(jobsTable.occurredAt));

  // ── 2. Attachments ────────────────────────────────────────────────────
  const jobIds = jobs.map((r) => r.job.id);
  const attachments =
    jobIds.length > 0
      ? await db.select().from(jobAttachmentsTable).where(inArray(jobAttachmentsTable.jobId, jobIds))
      : [];
  const attachmentsByJob: Record<number, typeof attachments> = {};
  for (const a of attachments) {
    if (!attachmentsByJob[a.jobId]) attachmentsByJob[a.jobId] = [];
    attachmentsByJob[a.jobId]!.push(a);
  }

  // ── 3. Expenses (period-scoped) ───────────────────────────────────────
  const expConds: ReturnType<typeof gte>[] = [];
  if (from) expConds.push(gte(expensesTable.occurredAt, from));
  if (to) expConds.push(lte(expensesTable.occurredAt, to));
  const expenses = await db
    .select({ expense: expensesTable, workerName: workersTable.name })
    .from(expensesTable)
    .leftJoin(workersTable, eq(expensesTable.workerId, workersTable.id))
    .where(expConds.length ? and(...expConds) : undefined)
    .orderBy(desc(expensesTable.occurredAt));

  // ── 4. Parts (period-scoped) ──────────────────────────────────────────
  const partConds: ReturnType<typeof gte>[] = [];
  if (from) partConds.push(gte(partsTable.occurredAt, from));
  if (to) partConds.push(lte(partsTable.occurredAt, to));
  const parts = await db
    .select()
    .from(partsTable)
    .where(partConds.length ? and(...partConds) : undefined)
    .orderBy(desc(partsTable.occurredAt));

  // ── 5. All-time tables (for accurate worker remaining balance) ─────────
  const allWorkerPayments = await db.select().from(workerPaymentsTable);
  const allAdjustments = await db.select().from(workerAdjustmentsTable);
  const allSharedShares = await db.select().from(jobWorkerSharesTable);
  const allTransfers = await db.select().from(workerTransfersTable);
  const allDebts = await db.select().from(workerDebtsTable);
  const allJobs = await db.select().from(jobsTable).where(eq(jobsTable.status, "approved"));
  const allExpenseLines = await db.select().from(jobExpenseLinesTable);
  const allExpenses = await db.select().from(expensesTable);
  const allParts = await db.select().from(partsTable);
  const allApprovedJobIds = new Set(allJobs.map((j) => j.id));

  // Period job expense lines (for detail display)
  const periodJobExpenseLines =
    jobIds.length > 0
      ? await db.select().from(jobExpenseLinesTable).where(inArray(jobExpenseLinesTable.jobId, jobIds))
      : [];

  // ── 6. Summary — mirrors analytics/summary + analytics/balances exactly ─
  const cashJobs = jobs.filter((r) => r.job.paymentMethod === "cash");
  const cardJobs = jobs.filter((r) => r.job.paymentMethod !== "cash");

  // Revenue
  const totalRevenue = jobs.reduce((s, r) => s + Number(r.job.grossAmount), 0);
  const cashRevenue = cashJobs.reduce((s, r) => s + Number(r.job.grossAmount), 0);
  const cardRevenue = cardJobs.reduce((s, r) => s + Number(r.job.grossAmount), 0);
  const cardNetRevenue = cardJobs.reduce((s, r) => s + Number(r.job.netAmount), 0);

  // VAT / card fees
  const totalVat = cardJobs.reduce((s, r) => s + Number(r.job.cardFeeAmount), 0);

  // Worker / workshop share
  const totalWorkerShare = jobs.reduce((s, r) => s + Number(r.job.workerShare), 0);
  const totalWorkshopShare = jobs.reduce((s, r) => s + Number(r.job.workshopShare), 0);

  // Direct expenses (workerId = null) — split by payment method
  const cashDirectExp = expenses
    .filter((r) => r.expense.workerId === null && r.expense.paidWith === "cash")
    .reduce((s, r) => s + Number(r.expense.amount), 0);
  const cardDirectExp = expenses
    .filter((r) => r.expense.workerId === null && r.expense.paidWith !== "cash")
    .reduce((s, r) => s + Number(r.expense.amount), 0);
  const totalDirectExp = cashDirectExp + cardDirectExp;

  // Parts — split by payment method
  const cashParts = parts
    .filter((p) => p.paidWith === "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  const cardParts = parts
    .filter((p) => p.paidWith !== "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  const totalParts = cashParts + cardParts;

  // Worker reimbursements (workerId ≠ null) — informational only, not in profit formula
  const workerExpenseReimb = expenses
    .filter((r) => r.expense.workerId !== null)
    .reduce((s, r) => s + Number(r.expense.amount), 0);
  const totalJobExpenseReimb = periodJobExpenseLines.reduce((s, el) => s + Number(el.amount), 0);

  // Period adjustments — informational only
  const periodAdj = allAdjustments.filter((a) => {
    if (from && a.occurredAt < from) return false;
    if (to && a.occurredAt > to) return false;
    return true;
  });
  const adjReimb = periodAdj.filter((a) => a.type === "reimbursement").reduce((s, a) => s + Number(a.amount), 0);
  const adjDeduct = periodAdj.filter((a) => a.type === "deduction").reduce((s, a) => s + Number(a.amount), 0);

  // ── Period Workshop Profit — matches analytics/summary workshopProfit ───
  //
  // cashBalance = cashRevenue − totalWorkerShare(ALL) − cashDirectExp − cashParts
  // cardBalance = cardNetRevenue(after VAT) − cardDirectExp − cardParts
  // workshopProfit = cashBalance + cardBalance
  const cashBalance = cashRevenue - totalWorkerShare - cashDirectExp - cashParts;
  const cardBalance = cardNetRevenue - cardDirectExp - cardParts;
  const workshopProfit = cashBalance + cardBalance;

  // ── All-time Cash on Hand — identical to analytics/balances cashOnHand ─
  //
  // This mirrors the dashboard "Cash on Hand" card exactly:
  //   cashOnHand = −sumOfWorkerRemaining − allTimeCashDirectExp − allTimeCashParts
  //
  // sumOfWorkerRemaining factors in payments made, reimbursements, transfers,
  // adjustment deductions, and uncollected debts — items the period formula omits.
  const workerRowsForBalance = await db.select().from(workersTable);
  let sumOfWorkerRemaining = 0;
  for (const w of workerRowsForBalance) {
    const wJobs = allJobs.filter((j) => j.workerId === w.id);
    const singleEarned = wJobs.reduce((s, j) => s + Number(j.workerShare), 0);
    const sharedEarned = allSharedShares
      .filter((sh) => sh.workerId === w.id && allApprovedJobIds.has(sh.jobId))
      .reduce((s, sh) => s + Number(sh.amount), 0);
    const workerEarned = singleEarned + sharedEarned;

    const cashCollected = allJobs
      .filter((j) => j.cashReceivedByWorkerId === w.id)
      .reduce((s, j) => s + Number(j.grossAmount), 0);

    const jobLineReimbBal = allExpenseLines
      .filter((el) => el.paidByWorkerId === w.id && allApprovedJobIds.has(el.jobId ?? -1))
      .reduce((s, el) => s + Number(el.amount), 0);
    const workerExpReimbBal = allExpenses
      .filter((e) => e.workerId === w.id)
      .reduce((s, e) => s + Number(e.amount), 0);
    const adjReimbBal = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "reimbursement")
      .reduce((s, a) => s + Number(a.amount), 0);
    const adjDeductBal = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "deduction")
      .reduce((s, a) => s + Number(a.amount), 0);
    const reimbursements = jobLineReimbBal + workerExpReimbBal + adjReimbBal;

    const transferNet = allTransfers.reduce((s, t) => {
      if (t.fromWorkerId === w.id) return s + Number(t.amount);
      if (t.toWorkerId === w.id) return s - Number(t.amount);
      return s;
    }, 0);

    const workerDebts = allDebts
      .filter((d) => d.workerId === w.id && !d.collected)
      .reduce((s, d) => s + Number(d.amount), 0);

    const paymentsMade = allWorkerPayments
      .filter((p) => p.workerId === w.id)
      .reduce((s, p) => s + Math.abs(Number(p.amount)), 0);

    const netOwed = workerEarned + reimbursements - cashCollected - adjDeductBal - workerDebts + transferNet;
    const remaining = netOwed - paymentsMade;
    sumOfWorkerRemaining += remaining;
  }

  const allTimeCashDirectExp = allExpenses
    .filter((e) => e.workerId === null && e.paidWith === "cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const allTimeCashParts = allParts
    .filter((p) => p.paidWith === "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  const allTimeCashOnHand = -sumOfWorkerRemaining - allTimeCashDirectExp - allTimeCashParts;

  // All-time card balance (mirrors analytics/balances cardBalance)
  let allTimeCardNetRevenue = 0;
  for (const j of allJobs) {
    if (j.paymentMethod !== "cash") allTimeCardNetRevenue += Number(j.netAmount);
  }
  const allTimeCardDirectExp = allExpenses
    .filter((e) => e.workerId === null && e.paidWith !== "cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const allTimeCardParts = allParts
    .filter((p) => p.paidWith !== "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  const allTimeCardBalance = allTimeCardNetRevenue - allTimeCardDirectExp - allTimeCardParts;

  // ── 7. Per-worker breakdown (all-time for accurate remaining balance) ──
  const workerRows = await db.select().from(workersTable).where(eq(workersTable.active, true));

  const workerBreakdown = workerRows
    .map((w) => {
      // Single-job earnings (period-scoped)
      const workerJobs = jobs.filter((r) => r.job.workerId === w.id);
      const singleEarned = workerJobs.reduce((s, r) => s + Number(r.job.workerShare), 0);

      // Shared-job earnings (all-time, mirrors by-worker endpoint)
      const sharedEarned = allSharedShares
        .filter((sh) => sh.workerId === w.id && allApprovedJobIds.has(sh.jobId))
        .reduce((s, sh) => s + Number(sh.amount), 0);

      const totalEarned = singleEarned + sharedEarned;

      // Cash collected from customers (all-time gross, worker physically holds this)
      const cashCollected = allJobs
        .filter((j) => j.cashReceivedByWorkerId === w.id)
        .reduce((s, j) => s + Number(j.grossAmount), 0);

      // Reimbursements (all-time, mirrors ledger endpoint)
      const expenseReimb = allExpenses
        .filter((e) => e.workerId === w.id)
        .reduce((s, e) => s + Number(e.amount), 0);
      const jobLineReimb = allExpenseLines
        .filter((el) => el.paidByWorkerId === w.id && allApprovedJobIds.has(el.jobId ?? -1))
        .reduce((s, el) => s + Number(el.amount), 0);
      const wAdjReimb = allAdjustments
        .filter((a) => a.workerId === w.id && a.type === "reimbursement")
        .reduce((s, a) => s + Number(a.amount), 0);
      const wAdjDeduct = allAdjustments
        .filter((a) => a.workerId === w.id && a.type === "deduction")
        .reduce((s, a) => s + Number(a.amount), 0);
      const totalReimbursements = expenseReimb + jobLineReimb + wAdjReimb;

      // Transfers (all-time)
      const transferNet = allTransfers.reduce((s, t) => {
        if (t.fromWorkerId === w.id) return s + Number(t.amount);
        if (t.toWorkerId === w.id) return s - Number(t.amount);
        return s;
      }, 0);

      // Uncollected debts (all-time)
      const workerDebtsTotal = allDebts
        .filter((d) => d.workerId === w.id && !d.collected)
        .reduce((s, d) => s + Number(d.amount), 0);

      // Payments — abs() to match ledger endpoint
      const totalPaid = allWorkerPayments
        .filter((p) => p.workerId === w.id)
        .reduce((s, p) => s + Math.abs(Number(p.amount)), 0);

      const netBalance = totalEarned + totalReimbursements - cashCollected - wAdjDeduct - workerDebtsTotal + transferNet;
      const remaining = netBalance - totalPaid;

      return {
        id: w.id,
        name: w.name,
        earned: totalEarned,
        cashCollected,
        reimbursements: totalReimbursements,
        adjDeductions: wAdjDeduct,
        netBalance,
        totalPaid,
        remaining,
      };
    })
    .filter((w) => w.earned > 0 || w.remaining !== 0);

  // ── 8. Response ────────────────────────────────────────────────────────
  res.json({
    generatedAt: new Date().toISOString(),
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    summary: {
      jobCount: jobs.length,
      // Revenue
      totalRevenue,
      cashRevenue,
      cardRevenue,
      cardNetRevenue,
      // VAT
      totalVat,
      // Shares
      totalWorkerShare,
      totalWorkshopShare,
      // Expenses (direct only — workerId = null)
      cashDirectExp,
      cardDirectExp,
      totalDirectExp,
      // Parts
      cashParts,
      cardParts,
      totalParts,
      // Detail (not in profit formula — informational)
      workerExpenseReimb,
      totalJobExpenseReimb,
      adjReimb,
      adjDeduct,
      // Period profit (period-scoped simplified formula)
      cashBalance,
      cardBalance,
      workshopProfit,
      // All-time balances — identical to analytics/balances (matches dashboard cards)
      allTimeCashOnHand,
      allTimeCardBalance,
    },
    jobs: jobs.map((r) => ({
      id: r.job.id,
      source: r.job.source,
      plateNumber: r.job.plateNumber,
      carModel: r.job.carModel,
      paymentMethod: r.job.paymentMethod,
      grossAmount: Number(r.job.grossAmount),
      workerShare: Number(r.job.workerShare),
      workshopShare: Number(r.job.workshopShare),
      netAmount: Number(r.job.netAmount),
      cardFeeAmount: Number(r.job.cardFeeAmount),
      workerName: r.workerName,
      occurredAt: r.job.occurredAt.toISOString(),
      notes: r.job.notes,
      attachments: (attachmentsByJob[r.job.id] ?? []).map((a) => ({
        id: a.id,
        label: a.label,
        purpose: a.purpose,
        originalName: a.originalName,
        mimetype: a.mimetype,
        downloadPath: attachmentDownloadPath(a.objectPath),
      })),
    })),
    expenses: expenses.map((r) => ({
      id: r.expense.id,
      description: r.expense.description,
      amount: Number(r.expense.amount),
      category: r.expense.category,
      paidWith: r.expense.paidWith,
      workerId: r.expense.workerId,
      workerName: r.workerName,
      occurredAt: r.expense.occurredAt.toISOString(),
    })),
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name,
      supplier: p.supplier,
      amount: Number(p.amount),
      quantity: Number(p.quantity),
      total: Number(p.amount) * Number(p.quantity),
      paidWith: p.paidWith,
      occurredAt: p.occurredAt.toISOString(),
    })),
    workers: workerBreakdown,
  });
});

export default router;
