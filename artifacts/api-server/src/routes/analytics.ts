import { Router, type IRouter } from "express";
import {
  db,
  jobsTable,
  expensesTable,
  partsTable,
  workersTable,
  workerPaymentsTable,
  jobExpenseLinesTable,
  jobWorkerSharesTable,
  workerAdjustmentsTable,
  workerDebtsTable,
} from "@workspace/db";
import { gte, desc, eq, and } from "drizzle-orm";
import {
  GetSummaryQueryParams,
  GetByWorkerQueryParams,
  GetTimeseriesQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function periodStart(period: "week" | "month" | "all" | undefined): Date | null {
  if (!period || period === "all") return null;
  const d = new Date();
  if (period === "week") d.setDate(d.getDate() - 7);
  else if (period === "month") d.setMonth(d.getMonth() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get("/analytics/summary", async (req, res) => {
  const params = GetSummaryQueryParams.parse(req.query);
  const start = periodStart(params.period);

  const jobs = await db
    .select()
    .from(jobsTable)
    .where(start ? and(eq(jobsTable.status, "approved"), gte(jobsTable.occurredAt, start)) : eq(jobsTable.status, "approved"));
  const expenses = await db
    .select()
    .from(expensesTable)
    .where(start ? gte(expensesTable.occurredAt, start) : undefined);
  const parts = await db
    .select()
    .from(partsTable)
    .where(start ? gte(partsTable.occurredAt, start) : undefined);
  const adjustments = await db
    .select()
    .from(workerAdjustmentsTable)
    .where(start ? gte(workerAdjustmentsTable.occurredAt, start) : undefined);

  // Job-level expenses paid by workers (not in expensesTable — separate table)
  const approvedJobIds = new Set(jobs.map((j) => j.id));
  const allExpenseLines = await db.select().from(jobExpenseLinesTable);
  const jobLineCost = allExpenseLines
    .filter((el) => approvedJobIds.has(el.jobId ?? -1))
    .reduce((s, el) => s + Number(el.amount), 0);

  let grossIncome = 0;
  let cardFees = 0;
  let netIncome = 0;
  let workerPayouts = 0;
  let workshopRevenue = 0;
  let cashIncome = 0;
  let cardIncome = 0;

  for (const j of jobs) {
    grossIncome += Number(j.grossAmount);
    cardFees += Number(j.cardFeeAmount);
    netIncome += Number(j.netAmount);
    workerPayouts += Number(j.workerShare);
    workshopRevenue += Number(j.workshopShare);
    if (j.paymentMethod === "cash") cashIncome += Number(j.grossAmount);
    else cardIncome += Number(j.grossAmount);
  }

  // Direct workshop-paid expenses (workerId is null — no worker involved)
  const workshopExpenses = expenses
    .filter((e) => e.workerId === null)
    .reduce((s, e) => s + Number(e.amount), 0);
  // Worker-paid expenses (worker fronted the cost, workshop reimburses via worker balance)
  const workerExpenseReimb = expenses
    .filter((e) => e.workerId !== null)
    .reduce((s, e) => s + Number(e.amount), 0);
  // Total expenses = both types + job-level lines
  const generalExpenses = workshopExpenses + workerExpenseReimb + jobLineCost;

  const partsCost = parts.reduce(
    (s, p) => s + Number(p.amount) * Number(p.quantity),
    0,
  );

  // Worker adjustments: reimbursements = extra cost to workshop, deductions = savings
  const adjReimbursements = adjustments
    .filter((a) => a.type === "reimbursement")
    .reduce((s, a) => s + Number(a.amount), 0);
  const adjDeductions = adjustments
    .filter((a) => a.type === "deduction")
    .reduce((s, a) => s + Number(a.amount), 0);

  // Monthly Profit = Cash Balance + Card Balance
  //   Cash Balance = cashGross(month) − allWorkerEarnings(month) − cashExp − cashParts
  //   Card Balance = cardGross(month) − cardExp − cardParts
  //   Sum = cashGross + cardGross − totalWorkerEarnings − allExp − allParts
  //       = workshopShare(cash) + workshopShare(card) − allExp − allParts
  let monthlyCashGross = 0;
  let monthlyCardGross = 0;
  let monthlyCardNet = 0;
  let monthlyVat = 0;
  let monthlyTotalWorkerEarnings = 0;
  for (const j of jobs) {
    if (j.paymentMethod === "cash") monthlyCashGross += Number(j.grossAmount);
    else {
      monthlyCardGross += Number(j.grossAmount);
      monthlyCardNet += Number(j.netAmount);
      monthlyVat += Number(j.cardFeeAmount);
    }
    monthlyTotalWorkerEarnings += Number(j.workerShare);
  }
  const monthlyCashDirectExp = expenses
    .filter((e) => e.workerId === null && e.paidWith === "cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const monthlyCardDirectExp = expenses
    .filter((e) => e.workerId === null && e.paidWith !== "cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const monthlyCashParts = parts
    .filter((p) => p.paidWith === "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  const monthlyCardParts = parts
    .filter((p) => p.paidWith !== "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);

  const monthlyCashBalance = monthlyCashGross - monthlyTotalWorkerEarnings - monthlyCashDirectExp - monthlyCashParts;
  const monthlyCardBalance = monthlyCardNet - monthlyCardDirectExp - monthlyCardParts;
  const workshopProfit = monthlyCashBalance + monthlyCardBalance;

  res.json({
    grossIncome,
    cardFees,
    netIncome,
    workerPayouts,
    workshopRevenue,
    workshopExpenses,
    workerExpenseReimb,
    jobLineCost,
    generalExpenses,
    partsCost,
    adjReimbursements,
    adjDeductions,
    workshopProfit,
    jobCount: jobs.length,
    cashIncome,
    cardIncome,
  });
});

router.get("/analytics/by-worker", async (req, res) => {
  const params = GetByWorkerQueryParams.parse(req.query);
  const start = periodStart(params.period);
  const workers = await db.select().from(workersTable);
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(start ? and(eq(jobsTable.status, "approved"), gte(jobsTable.occurredAt, start)) : eq(jobsTable.status, "approved"));
  const expenses = await db
    .select()
    .from(expensesTable)
    .where(start ? gte(expensesTable.occurredAt, start) : undefined);

  // Load all worker payments (always unfiltered — reflects real balance owed)
  const allPayments = await db.select().from(workerPaymentsTable);

  // Load shared-job worker shares
  const allSharedShares = await db.select().from(jobWorkerSharesTable);

  // Load job-level expense lines paid by workers (reimbursements)
  const allExpenseLines = await db.select().from(jobExpenseLinesTable);

  // Load all worker adjustments (always unfiltered — reflects true all-time balance)
  const allAdjustments = await db.select().from(workerAdjustmentsTable);

  // All approved job IDs for filtering
  const approvedJobIds = new Set(jobs.map((j) => j.id));

  const out = workers.map((w) => {
    const wJobs = jobs.filter((j) => j.workerId === w.id);
    const grossIncome = wJobs.reduce((s, j) => s + Number(j.grossAmount), 0);

    // Earnings from single jobs
    const singleEarned = wJobs.reduce((s, j) => s + Number(j.workerShare), 0);

    // Earnings from shared jobs (only within the period's approved jobs)
    const sharedEarned = allSharedShares
      .filter((sh) => sh.workerId === w.id && approvedJobIds.has(sh.jobId))
      .reduce((s, sh) => s + Number(sh.amount), 0);

    const workerEarned = singleEarned + sharedEarned;

    const workshopEarned = wJobs.reduce((s, j) => s + Number(j.workshopShare), 0);

    // Cash the worker collected from customers (full gross amount — they already have their cut)
    const cashCollected = jobs
      .filter((j) => j.cashReceivedByWorkerId === w.id)
      .reduce((s, j) => s + Number(j.grossAmount), 0);

    // Job-level reimbursements (worker paid job expenses out of pocket — add to what shop owes)
    const jobLineReimb = allExpenseLines
      .filter((el) => el.paidByWorkerId === w.id && approvedJobIds.has(el.jobId ?? -1))
      .reduce((s, el) => s + Number(el.amount), 0);

    // Workshop-level expenses linked to this worker = worker paid on behalf of shop → also reimbursements (ADDED)
    const workerExpenseReimb = expenses
      .filter((e) => e.workerId === w.id)
      .reduce((s, e) => s + Number(e.amount), 0);

    // Worker adjustments (reimbursements add, deductions subtract)
    const adjReimb = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "reimbursement")
      .reduce((s, a) => s + Number(a.amount), 0);
    const adjDeduct = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "deduction")
      .reduce((s, a) => s + Number(a.amount), 0);

    const reimbursements = jobLineReimb + workerExpenseReimb + adjReimb;

    // Payments already made to this worker (always use full history)
    const paymentsMade = allPayments
      .filter((p) => p.workerId === w.id)
      .reduce((s, p) => s + Number(p.amount), 0);

    // Net: positive = shop owes worker, negative = worker owes shop
    // Formula mirrors the ledger endpoint exactly: earned + reimbursements - cashCollected - deductions - payments
    const netOwed = workerEarned + reimbursements - cashCollected - adjDeduct;
    const remaining = netOwed - paymentsMade;

    return {
      workerId: w.id,
      name: w.name,
      jobCount: wJobs.length,
      grossIncome,
      workerEarned,
      workshopEarned,
      cashCollected,
      reimbursements,
      paymentsMade,
      netOwed,
      remaining,
    };
  });
  res.json(out);
});

router.get("/analytics/timeseries", async (req, res) => {
  const params = GetTimeseriesQueryParams.parse(req.query);
  const start = periodStart(params.period);
  const bucket = params.bucket ?? "day";

  const jobs = await db
    .select()
    .from(jobsTable)
    .where(start ? and(eq(jobsTable.status, "approved"), gte(jobsTable.occurredAt, start)) : eq(jobsTable.status, "approved"));
  const expenses = await db
    .select()
    .from(expensesTable)
    .where(start ? gte(expensesTable.occurredAt, start) : undefined);
  const parts = await db
    .select()
    .from(partsTable)
    .where(start ? gte(partsTable.occurredAt, start) : undefined);

  function bucketKey(d: Date): string {
    const dt = new Date(d);
    if (bucket === "month") return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (bucket === "week") {
      const onejan = new Date(dt.getFullYear(), 0, 1);
      const wk = Math.ceil(
        ((dt.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) /
          7,
      );
      return `${dt.getFullYear()}-W${String(wk).padStart(2, "0")}`;
    }
    return dt.toISOString().slice(0, 10);
  }

  const map = new Map<string, { income: number; expenses: number }>();
  for (const j of jobs) {
    const k = bucketKey(j.occurredAt);
    const cur = map.get(k) ?? { income: 0, expenses: 0 };
    cur.income += Number(j.workshopShare);
    map.set(k, cur);
  }
  for (const e of expenses) {
    const k = bucketKey(e.occurredAt);
    const cur = map.get(k) ?? { income: 0, expenses: 0 };
    cur.expenses += Number(e.amount);
    map.set(k, cur);
  }
  for (const p of parts) {
    const k = bucketKey(p.occurredAt);
    const cur = map.get(k) ?? { income: 0, expenses: 0 };
    cur.expenses += Number(p.amount) * Number(p.quantity);
    map.set(k, cur);
  }

  const out = Array.from(map.entries())
    .map(([bucket, v]) => ({
      bucket,
      income: v.income,
      expenses: v.expenses,
      profit: v.income - v.expenses,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  res.json(out);
});

router.get("/analytics/balances", async (_req, res) => {
  const jobs = await db.select().from(jobsTable).where(eq(jobsTable.status, "approved"));
  const expenses = await db.select().from(expensesTable);
  const parts = await db.select().from(partsTable);
  const workers = await db.select().from(workersTable);
  const allPayments = await db.select().from(workerPaymentsTable);
  const allSharedShares = await db.select().from(jobWorkerSharesTable);
  const allExpenseLines = await db.select().from(jobExpenseLinesTable);
  const allAdjustments = await db.select().from(workerAdjustmentsTable);

  // ── Card balance ──────────────────────────────────────────────────────
  let cardNetTotal = 0;
  let cardGrossTotal = 0;
  let totalVat = 0;
  for (const j of jobs) {
    if (j.paymentMethod !== "cash") {
      cardNetTotal += Number(j.netAmount);
      cardGrossTotal += Number(j.grossAmount);
      totalVat += Number(j.cardFeeAmount);
    }
  }
  const cardDirectExpenses = expenses
    .filter((e) => e.workerId === null && e.paidWith !== "cash")
    .reduce((s, e) => s + Number(e.amount), 0);
  const cardPaidParts = parts
    .filter((p) => p.paidWith !== "cash")
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);
  const cardBalance = cardNetTotal - cardDirectExpenses - cardPaidParts;

  // ── Cash on hand ──────────────────────────────────────────────────────
  // Formula: cashOnHand = −sum(all workers' remaining balances) − direct expenses − all parts
  //
  // "remaining" per worker = what the shop still owes the worker (positive) or
  //   what the worker still owes the shop (negative).
  // A negative overall sum means workers owe the shop more than the shop owes them →
  //   that outstanding amount is positive available cash.
  // Direct expenses and parts paid by the workshop are then deducted.

  const approvedJobIds = new Set(jobs.map((j) => j.id));

  let sumOfWorkerRemaining = 0;
  for (const w of workers) {
    const wJobs = jobs.filter((j) => j.workerId === w.id);
    const singleEarned = wJobs.reduce((s, j) => s + Number(j.workerShare), 0);
    const sharedEarned = allSharedShares
      .filter((sh) => sh.workerId === w.id && approvedJobIds.has(sh.jobId))
      .reduce((s, sh) => s + Number(sh.amount), 0);
    const workerEarned = singleEarned + sharedEarned;

    const cashCollected = jobs
      .filter((j) => j.cashReceivedByWorkerId === w.id)
      .reduce((s, j) => s + Number(j.grossAmount), 0);

    const jobLineReimb = allExpenseLines
      .filter((el) => el.paidByWorkerId === w.id && approvedJobIds.has(el.jobId ?? -1))
      .reduce((s, el) => s + Number(el.amount), 0);
    const workerExpenseReimb = expenses
      .filter((e) => e.workerId === w.id)
      .reduce((s, e) => s + Number(e.amount), 0);
    const adjReimb = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "reimbursement")
      .reduce((s, a) => s + Number(a.amount), 0);
    const adjDeduct = allAdjustments
      .filter((a) => a.workerId === w.id && a.type === "deduction")
      .reduce((s, a) => s + Number(a.amount), 0);

    const reimbursements = jobLineReimb + workerExpenseReimb + adjReimb;
    const netOwed = workerEarned + reimbursements - cashCollected - adjDeduct;

    const paymentsMade = allPayments
      .filter((p) => p.workerId === w.id)
      .reduce((s, p) => s + Number(p.amount), 0);

    const remaining = netOwed - paymentsMade;
    sumOfWorkerRemaining += remaining;
  }

  // Direct expenses paid by workshop (not linked to any worker)
  const directExpenses = expenses
    .filter((e) => e.workerId === null)
    .reduce((s, e) => s + Number(e.amount), 0);

  // All parts costs
  const allParts = parts
    .reduce((s, p) => s + Number(p.amount) * Number(p.quantity), 0);

  const cashOnHand = -sumOfWorkerRemaining - directExpenses - allParts;

  const totalAvailable = cashOnHand + cardBalance;

  res.json({
    cashOnHand,
    cardBalance,
    totalVat,
    // Breakdown for dashboard sub-labels
    sumOfWorkerRemaining,
    directExpenses,
    allParts,
    cardNetTotal,
    cardGrossTotal,
    cardDirectExpenses,
    cardPaidParts,
    totalAvailable,
  });
});

router.get("/analytics/recent", async (_req, res) => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.status, "approved"))
    .orderBy(desc(jobsTable.occurredAt))
    .limit(15);
  const expenses = await db
    .select()
    .from(expensesTable)
    .orderBy(desc(expensesTable.occurredAt))
    .limit(15);
  const parts = await db
    .select()
    .from(partsTable)
    .orderBy(desc(partsTable.occurredAt))
    .limit(15);

  const items = [
    ...jobs.map((j) => ({
      id: `job-${j.id}`,
      kind: "job" as const,
      label: j.source,
      amount: Number(j.grossAmount),
      occurredAt: j.occurredAt.toISOString(),
    })),
    ...expenses.map((e) => ({
      id: `expense-${e.id}`,
      kind: "expense" as const,
      label: e.description,
      amount: -Number(e.amount),
      occurredAt: e.occurredAt.toISOString(),
    })),
    ...parts.map((p) => ({
      id: `part-${p.id}`,
      kind: "part" as const,
      label: p.name,
      amount: -Number(p.amount) * Number(p.quantity),
      occurredAt: p.occurredAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 20);

  res.json(items);
});

export default router;
