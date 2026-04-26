import { Router, type IRouter } from "express";
import { db, jobsTable, expensesTable, partsTable, workersTable, jobAttachmentsTable, jobWorkerSharesTable, workerPaymentsTable, workerAdjustmentsTable, jobExpenseLinesTable, workerTransfersTable, workerDebtsTable } from "@workspace/db";
import { eq, gte, lte, and, desc, inArray } from "drizzle-orm";

const router: IRouter = Router();

function attachmentDownloadPath(objectPath: string) {
  // objectPath stored as e.g. /objects/uuid/file.pdf
  // Download route is /storage/objects/*path → internally /objects/${path}
  const trimmed = objectPath.replace(/^\/objects\//, "").replace(/^\//, "");
  return `/api/storage/objects/${trimmed}`;
}

router.get("/reports", async (req, res) => {
  const from = req.query.from ? new Date(req.query.from as string) : null;
  const to = req.query.to ? new Date(req.query.to as string) : null;
  if (to) to.setHours(23, 59, 59, 999);

  // ── 1. Jobs ──────────────────────────────────────────────────────────────
  const jobConds = [eq(jobsTable.status, "approved")];
  if (from) jobConds.push(gte(jobsTable.occurredAt, from));
  if (to) jobConds.push(lte(jobsTable.occurredAt, to));

  const jobs = await db
    .select({
      job: jobsTable,
      workerName: workersTable.name,
    })
    .from(jobsTable)
    .leftJoin(workersTable, eq(jobsTable.workerId, workersTable.id))
    .where(and(...jobConds))
    .orderBy(desc(jobsTable.occurredAt));

  // ── 2. Fetch attachments for all jobs ─────────────────────────────────
  const jobIds = jobs.map((r) => r.job.id);
  const attachments =
    jobIds.length > 0
      ? await db
          .select()
          .from(jobAttachmentsTable)
          .where(inArray(jobAttachmentsTable.jobId, jobIds))
      : [];

  const attachmentsByJob: Record<number, typeof attachments> = {};
  for (const a of attachments) {
    if (!attachmentsByJob[a.jobId]) attachmentsByJob[a.jobId] = [];
    attachmentsByJob[a.jobId]!.push(a);
  }

  // ── 3. Expenses ───────────────────────────────────────────────────────
  const expConds = [];
  if (from) expConds.push(gte(expensesTable.occurredAt, from));
  if (to) expConds.push(lte(expensesTable.occurredAt, to));
  const expenses = await db
    .select({ expense: expensesTable, workerName: workersTable.name })
    .from(expensesTable)
    .leftJoin(workersTable, eq(expensesTable.workerId, workersTable.id))
    .where(expConds.length ? and(...expConds) : undefined)
    .orderBy(desc(expensesTable.occurredAt));

  // ── 4. Parts ──────────────────────────────────────────────────────────
  const partConds = [];
  if (from) partConds.push(gte(partsTable.occurredAt, from));
  if (to) partConds.push(lte(partsTable.occurredAt, to));
  const parts = await db
    .select()
    .from(partsTable)
    .where(partConds.length ? and(...partConds) : undefined)
    .orderBy(desc(partsTable.occurredAt));

  // ── 5. Worker payments (all time for accurate remaining balance) ───────
  const allWorkerPayments = await db.select().from(workerPaymentsTable);
  const paymentsByWorker: Record<number, number> = {};
  for (const p of allWorkerPayments) {
    // Use abs() to match ledger endpoint — payments are always reductions
    paymentsByWorker[p.workerId] = (paymentsByWorker[p.workerId] ?? 0) + Math.abs(Number(p.amount));
  }

  // ── 5b. Worker adjustments (all time — affects per-worker balance) ──────
  const allAdjustments = await db.select().from(workerAdjustmentsTable);

  // ── 5e. Worker transfers and debts (all-time for accurate remaining) ───
  const allTransfers = await db.select().from(workerTransfersTable);
  const allDebts = await db.select().from(workerDebtsTable);

  // ── 5c. Job expense lines for period jobs ─────────────────────────────
  const periodJobExpenseLines = jobIds.length > 0
    ? await db.select().from(jobExpenseLinesTable).where(inArray(jobExpenseLinesTable.jobId, jobIds))
    : [];

  // ── 5d. All shared-job worker shares (all-time, for accurate remaining) ─
  const allSharedShares = await db.select().from(jobWorkerSharesTable);
  const allJobs = await db.select().from(jobsTable).where(eq(jobsTable.status, "approved"));
  const allApprovedJobIds = new Set(allJobs.map((j) => j.id));
  const allExpenseLines = await db.select().from(jobExpenseLinesTable);
  const allExpenses = await db.select().from(expensesTable);

  // ── 6. Summary totals ─────────────────────────────────────────────────
  const totalRevenue = jobs.reduce((s, r) => s + Number(r.job.grossAmount), 0);
  const totalCashRevenue = jobs.filter((r) => r.job.paymentMethod === "cash").reduce((s, r) => s + Number(r.job.grossAmount), 0);
  const totalCardRevenue = jobs.filter((r) => r.job.paymentMethod !== "cash").reduce((s, r) => s + Number(r.job.grossAmount), 0);
  const totalWorkerShare = jobs.reduce((s, r) => s + Number(r.job.workerShare), 0);
  const totalWorkshopShare = jobs.reduce((s, r) => s + Number(r.job.workshopShare), 0);

  const totalWorkshopExpenses = expenses
    .filter((r) => r.expense.workerId === null)
    .reduce((s, r) => s + Number(r.expense.amount), 0);
  const totalWorkerReimbursements = expenses
    .filter((r) => r.expense.workerId !== null)
    .reduce((s, r) => s + Number(r.expense.amount), 0);
  const totalParts = parts.reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);

  // VAT = card fee amounts collected on top of the gross (passed through on card jobs)
  const totalVat = jobs.reduce((s, r) => s + Number(r.job.cardFeeAmount), 0);

  // Job-level expense lines (workers paid out-of-pocket for job costs — reimbursable)
  const totalJobExpenseReimb = periodJobExpenseLines.reduce((s, el) => s + Number(el.amount), 0);

  // Worker adjustments — filter to the report period
  const fromDate = from;
  const toDate = to;
  const periodAdj = allAdjustments.filter((a) => {
    if (fromDate && a.occurredAt < fromDate) return false;
    if (toDate && a.occurredAt > toDate) return false;
    return true;
  });
  const totalAdjReimbursements = periodAdj
    .filter((a) => a.type === "reimbursement")
    .reduce((s, a) => s + Number(a.amount), 0);
  const totalAdjDeductions = periodAdj
    .filter((a) => a.type === "deduction")
    .reduce((s, a) => s + Number(a.amount), 0);

  // Workshop net profit (no VAT):
  //   workshopShare from all jobs
  //   − workshop-paid expenses (direct overhead)
  //   − worker-paid expenses (workshop reimburses workers; flows through worker balance)
  //   − job-level expense lines (workers fronted; also reimbursable)
  //   − parts cost
  //   − adj reimbursements (extra payments to workers)
  //   + adj deductions (amounts deducted from worker balances)
  const workshopNet =
    totalWorkshopShare
    - totalWorkshopExpenses
    - totalWorkerReimbursements
    - totalJobExpenseReimb
    - totalParts
    - totalAdjReimbursements
    + totalAdjDeductions;

  // Workshop net WITH VAT included (VAT is collected on top; full picture)
  const workshopNetWithVat = workshopNet + totalVat;

  // ── Cash vs Card analysis ─────────────────────────────────────────────
  // Design rule: Cash section absorbs ALL adjustments (adj deductions/reimbursements,
  // worker expense reimbursements, job-line reimbursements) so that:
  //   cashNetProfit + cardNet = workshopNetWithVat  (Net Profit incl. VAT)
  const cashJobs = jobs.filter((r) => r.job.paymentMethod === "cash");
  const cardJobs = jobs.filter((r) => r.job.paymentMethod !== "cash");

  const cashWorkshopShare = cashJobs.reduce((s, r) => s + Number(r.job.workshopShare), 0);
  const cashDirectExpenses = expenses
    .filter((r) => r.expense.workerId === null && r.expense.paidWith === "cash")
    .reduce((s, r) => s + Number(r.expense.amount), 0);
  const cashPartsTotal = parts
    .filter((p) => p.paidWith === "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  // cashNetProfit = cashWorkshopShare − cashExpenses − cashParts
  //              + adjDeductions − adjReimbursements
  //              − workerExpenseReimb − jobLineReimb
  // This guarantees: cashNetProfit + cardNet = workshopNetWithVat
  const cashNetProfit =
    cashWorkshopShare
    - cashDirectExpenses
    - cashPartsTotal
    + totalAdjDeductions
    - totalAdjReimbursements
    - totalWorkerReimbursements
    - totalJobExpenseReimb;

  const cardDirectExpenses = expenses
    .filter((r) => r.expense.workerId === null && r.expense.paidWith !== "cash")
    .reduce((s, r) => s + Number(r.expense.amount), 0);
  const cardPartsTotal = parts
    .filter((p) => p.paidWith !== "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  const cardWorkshopShare = cardJobs.reduce((s, r) => s + Number(r.job.workshopShare), 0);
  const cardVatTotal = cardJobs.reduce((s, r) => s + Number(r.job.cardFeeAmount), 0);
  // cardNet = cardWorkshopShare + VAT − cardExpenses − cardParts
  const cardNet = cardWorkshopShare + cardVatTotal - cardDirectExpenses - cardPartsTotal;

  const cashAnalysis = {
    revenue: cashJobs.reduce((s, r) => s + Number(r.job.grossAmount), 0),
    workerShare: cashJobs.reduce((s, r) => s + Number(r.job.workerShare), 0),
    workshopShare: cashWorkshopShare,
    directExpenses: cashDirectExpenses,
    parts: cashPartsTotal,
    // All adjustments sit in the cash section
    adjDeductions: totalAdjDeductions,
    adjReimbursements: totalAdjReimbursements,
    workerExpenseReimb: totalWorkerReimbursements,
    jobLineReimb: totalJobExpenseReimb,
    cashNetProfit,
    jobCount: cashJobs.length,
  };

  const cardAnalysis = {
    revenue: cardJobs.reduce((s, r) => s + Number(r.job.grossAmount), 0),
    vat: cardVatTotal,
    netRevenue: cardJobs.reduce((s, r) => s + Number(r.job.netAmount), 0),
    workerShare: cardJobs.reduce((s, r) => s + Number(r.job.workerShare), 0),
    workshopShare: cardWorkshopShare,
    directExpenses: cardDirectExpenses,
    parts: cardPartsTotal,
    cardNet,
    jobCount: cardJobs.length,
  }

  // ── 7. Per-worker breakdown (all-time remaining for accurate balances) ─
  const workerRows = await db.select().from(workersTable).where(eq(workersTable.active, true));

  const workerBreakdown = workerRows.map((w) => {
    // Period-scoped: single-job earnings within the report window
    const workerJobs = jobs.filter(
      (r) => r.job.workerId === w.id && r.job.jobType !== "shared",
    );
    const earned = workerJobs.reduce((s, r) => s + Number(r.job.workerShare), 0);

    // cashCollected uses full gross of cash jobs where this worker was the receiver (all-time)
    const cashCollected = allJobs
      .filter((j) => j.cashReceivedByWorkerId === w.id)
      .reduce((s, j) => s + Number(j.grossAmount), 0);

    // All-time shared job earnings
    const sharedEarned = allSharedShares
      .filter((sh) => sh.workerId === w.id && allApprovedJobIds.has(sh.jobId))
      .reduce((s, sh) => s + Number(sh.amount), 0);

    // All-time reimbursements
    const reimbursements = allExpenses
      .filter((e) => e.workerId === w.id)
      .reduce((s, e) => s + Number(e.amount), 0);
    const jobLineReimb = allExpenseLines
      .filter((el) => el.paidByWorkerId === w.id && allApprovedJobIds.has(el.jobId ?? -1))
      .reduce((s, el) => s + Number(el.amount), 0);

    // Worker adjustments (all-time)
    const adjReimb = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "reimbursement")
      .reduce((s, a) => s + Number(a.amount), 0);
    const adjDeduct = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "deduction")
      .reduce((s, a) => s + Number(a.amount), 0);

    // Worker-to-worker transfers: sent (+) relieve debt, received (-) add to what worker holds
    const transferNet = allTransfers.reduce((s, t) => {
      if (t.fromWorkerId === w.id) return s + Number(t.amount);
      if (t.toWorkerId === w.id) return s - Number(t.amount);
      return s;
    }, 0);

    // Uncollected debts reduce the net balance
    const workerDebtsTotal = allDebts
      .filter((d) => d.workerId === w.id && !d.collected)
      .reduce((s, d) => s + Number(d.amount), 0);

    const totalEarned = earned + sharedEarned;
    const totalReimbursements = reimbursements + jobLineReimb + adjReimb;
    const netBalance = totalEarned + totalReimbursements - cashCollected - adjDeduct - workerDebtsTotal + transferNet;
    const totalPaid = paymentsByWorker[w.id] ?? 0;
    const remaining = netBalance - totalPaid;

    return {
      id: w.id,
      name: w.name,
      earned: totalEarned,
      cashCollected,
      reimbursements: totalReimbursements,
      adjReimbursements: adjReimb,
      adjDeductions: adjDeduct,
      netBalance,
      totalPaid,
      remaining,
    };
  }).filter((w) => w.earned > 0 || w.remaining !== 0);


  // ── 8. Build response ─────────────────────────────────────────────────
  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    summary: {
      jobCount: jobs.length,
      totalRevenue,
      totalCashRevenue,
      totalCardRevenue,
      totalWorkerShare,
      totalWorkshopShare,
      totalWorkshopExpenses,
      totalWorkerReimbursements,
      totalJobExpenseReimb,
      totalParts,
      totalVat,
      totalAdjReimbursements,
      totalAdjDeductions,
      workshopNet,
      workshopNetWithVat,
      // Cash vs card split
      cashAnalysis,
      cardAnalysis,
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
