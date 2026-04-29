import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import workersRouter from "./workers";
import jobsRouter from "./jobs";
import jobAttachmentsRouter from "./job-attachments";
import portalJobsRouter from "./portal-jobs";
import expensesRouter from "./expenses";
import partsRouter from "./parts";
import analyticsRouter from "./analytics";
import reportsRouter from "./reports";
import storageRouter from "./storage";
import authRouter, { seedAdminAccount } from "./auth";
import backupRouter from "./backup";
import attendanceRouter from "./attendance";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

seedAdminAccount().catch(console.error);

router.use(authRouter);

router.use(requireAuth);

router.use(healthRouter);
router.use(settingsRouter);
router.use(workersRouter);
router.use(jobsRouter);
router.use(jobAttachmentsRouter);
router.use(portalJobsRouter);
router.use(expensesRouter);
router.use(partsRouter);
router.use(analyticsRouter);
router.use(reportsRouter);
router.use(storageRouter);
router.use(backupRouter);
router.use(attendanceRouter);

export default router;
