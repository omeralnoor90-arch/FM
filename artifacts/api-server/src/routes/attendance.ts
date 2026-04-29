import { Router, type IRouter } from "express";
import { db, attendanceSettingsTable, attendanceRecordsTable, workersTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAdminOrManager } from "../middleware/auth";

const router: IRouter = Router();

// ── Haversine distance (meters) ──────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Ensure a settings row exists ─────────────────────────────────────────────
async function ensureSettings() {
  const rows = await db.select().from(attendanceSettingsTable).limit(1);
  if (rows.length === 0) {
    const [row] = await db.insert(attendanceSettingsTable).values({}).returning();
    return row!;
  }
  return rows[0]!;
}

// ── GET /attendance/settings ─────────────────────────────────────────────────
router.get("/attendance/settings", requireAdminOrManager, async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.json(settings);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// ── PUT /attendance/settings ─────────────────────────────────────────────────
router.put("/attendance/settings", requireAdminOrManager, async (req, res) => {
  try {
    const existing = await ensureSettings();
    const {
      isActive,
      workStartTime,
      graceMinutes,
      locationName,
      locationLat,
      locationLng,
      locationRadiusMeters,
    } = req.body;

    const [updated] = await db
      .update(attendanceSettingsTable)
      .set({
        ...(isActive !== undefined && { isActive }),
        ...(workStartTime !== undefined && { workStartTime }),
        ...(graceMinutes !== undefined && { graceMinutes: Number(graceMinutes) }),
        ...(locationName !== undefined && { locationName }),
        ...(locationLat !== undefined && { locationLat: locationLat === null ? null : Number(locationLat) }),
        ...(locationLng !== undefined && { locationLng: locationLng === null ? null : Number(locationLng) }),
        ...(locationRadiusMeters !== undefined && { locationRadiusMeters: Number(locationRadiusMeters) }),
        updatedAt: new Date(),
      })
      .where(eq(attendanceSettingsTable.id, existing.id))
      .returning();

    res.json(updated);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ── POST /attendance/check-in ─────────────────────────────────────────────────
router.post("/attendance/check-in", async (req, res) => {
  try {
    const session = req.session;
    if (!session?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const workerId = session.workerId;
    if (!workerId) {
      res.status(403).json({ error: "Only workers can check in" });
      return;
    }

    const settings = await ensureSettings();
    const { lat, lng } = req.body as { lat?: number | null; lng?: number | null };

    // Determine today's date in local time (YYYY-MM-DD)
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Check if already checked in today
    const existing = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.workerId, workerId),
          eq(attendanceRecordsTable.checkDate, today)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Return the existing record with worker name
      const worker = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
      res.json({ ...existing[0], workerName: worker[0]?.name ?? "" });
      return;
    }

    // Calculate distance and status
    let distanceMeters: number | null = null;
    let isWithinZone: boolean | null = null;
    let status = "present";

    if (
      settings.isActive &&
      settings.locationLat != null &&
      settings.locationLng != null &&
      lat != null &&
      lng != null
    ) {
      distanceMeters = Math.round(
        haversineMeters(settings.locationLat, settings.locationLng, lat, lng)
      );
      isWithinZone = distanceMeters <= settings.locationRadiusMeters;

      if (!isWithinZone) {
        status = "outside-zone";
      } else {
        // Check if on time or late
        const [h, m] = settings.workStartTime.split(":").map(Number);
        const workStart = new Date(now);
        workStart.setHours(h!, m!, 0, 0);
        const graceEnd = new Date(workStart.getTime() + settings.graceMinutes * 60000);
        status = now <= graceEnd ? "on-time" : "late";
      }
    }

    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({
        workerId,
        checkDate: today,
        checkInAt: now,
        lat: lat ?? null,
        lng: lng ?? null,
        distanceMeters,
        isWithinZone,
        status,
      })
      .returning();

    const worker = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
    res.json({ ...record, workerName: worker[0]?.name ?? "" });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to check in" });
  }
});

// ── GET /attendance/today ─────────────────────────────────────────────────────
router.get("/attendance/today", requireAdminOrManager, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const workers = await db.select().from(workersTable).where(eq(workersTable.active, true));
    const records = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.checkDate, today));

    const recordByWorker = new Map(records.map((r) => [r.workerId, r]));

    const result = workers.map((w) => {
      const record = recordByWorker.get(w.id);
      return {
        workerId: w.id,
        workerName: w.name,
        hasCheckedIn: !!record,
        record: record ? { ...record, workerName: w.name } : null,
      };
    });

    res.json(result);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to fetch today's attendance" });
  }
});

// ── GET /attendance/records ───────────────────────────────────────────────────
router.get("/attendance/records", requireAdminOrManager, async (req, res) => {
  try {
    const { from, to, workerId } = req.query as { from?: string; to?: string; workerId?: string };

    const conds = [];
    if (from) conds.push(gte(attendanceRecordsTable.checkDate, from));
    if (to) conds.push(lte(attendanceRecordsTable.checkDate, to));
    if (workerId) conds.push(eq(attendanceRecordsTable.workerId, Number(workerId)));

    const records = await db
      .select({ record: attendanceRecordsTable, workerName: workersTable.name })
      .from(attendanceRecordsTable)
      .leftJoin(workersTable, eq(attendanceRecordsTable.workerId, workersTable.id))
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(attendanceRecordsTable.checkInAt));

    res.json(records.map((r) => ({ ...r.record, workerName: r.workerName ?? "" })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

// ── GET /attendance/my-today ──────────────────────────────────────────────────
router.get("/attendance/my-today", async (req, res) => {
  try {
    const workerId = req.session?.workerId;
    if (!workerId) {
      res.status(403).json({ error: "Worker only" });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const records = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.workerId, workerId),
          eq(attendanceRecordsTable.checkDate, today)
        )
      )
      .limit(1);

    if (records.length === 0) {
      res.status(404).json({ error: "No check-in today" });
      return;
    }
    const worker = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
    res.json({ ...records[0], workerName: worker[0]?.name ?? "" });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to fetch today record" });
  }
});

// ── GET /attendance/my-records ────────────────────────────────────────────────
router.get("/attendance/my-records", async (req, res) => {
  try {
    const workerId = req.session?.workerId;
    if (!workerId) {
      res.status(403).json({ error: "Worker only" });
      return;
    }
    const records = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.workerId, workerId))
      .orderBy(desc(attendanceRecordsTable.checkInAt));

    const worker = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
    res.json(records.map((r) => ({ ...r, workerName: worker[0]?.name ?? "" })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

export default router;
