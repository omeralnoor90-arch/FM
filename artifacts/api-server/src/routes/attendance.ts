import { Router, type IRouter } from "express";
import { db, attendanceSettingsTable, attendanceRecordsTable, workersTable, failedCheckInAttemptsTable } from "@workspace/db";
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
      const worker = await db.select().from(workersTable).where(eq(workersTable.id, workerId)).limit(1);
      res.json({ ...existing[0], workerName: worker[0]?.name ?? "" });
      return;
    }

    // ── Location enforcement (when system is active and location is configured) ──
    const workshopLat = settings.locationLat != null ? Number(settings.locationLat) : null;
    const workshopLng = settings.locationLng != null ? Number(settings.locationLng) : null;
    const radiusMeters = Number(settings.locationRadiusMeters) || 200;

    if (settings.isActive && workshopLat != null && workshopLng != null) {
      // Block if no location provided
      if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) {
        await db.insert(failedCheckInAttemptsTable).values({
          workerId,
          checkDate: today,
          reason: "location_denied",
          lat: null,
          lng: null,
          distanceMeters: null,
        });
        res.status(403).json({ error: "location_required" });
        return;
      }

      // Block if outside zone
      const distance = Math.round(
        haversineMeters(workshopLat, workshopLng, Number(lat), Number(lng))
      );

      if (isNaN(distance) || distance > radiusMeters) {
        await db.insert(failedCheckInAttemptsTable).values({
          workerId,
          checkDate: today,
          reason: "outside_zone",
          lat: Number(lat),
          lng: Number(lng),
          distanceMeters: isNaN(distance) ? null : distance,
        });
        res.status(403).json({
          error: "outside_zone",
          distanceMeters: isNaN(distance) ? null : distance,
          radiusMeters,
        });
        return;
      }
    }

    // If system is active but location is not yet configured, require worker to provide coordinates
    // but don't enforce zone — log the attempt as informational
    if (settings.isActive && (workshopLat == null || workshopLng == null)) {
      if (lat == null || lng == null) {
        await db.insert(failedCheckInAttemptsTable).values({
          workerId,
          checkDate: today,
          reason: "location_denied",
          lat: null,
          lng: null,
          distanceMeters: null,
        });
        res.status(403).json({ error: "location_required" });
        return;
      }
    }

    // ── Calculate final status ────────────────────────────────────────────────
    let distanceMeters: number | null = null;
    let isWithinZone: boolean | null = null;
    let status = "present";

    if (
      settings.isActive &&
      workshopLat != null &&
      workshopLng != null &&
      lat != null &&
      lng != null
    ) {
      distanceMeters = Math.round(
        haversineMeters(workshopLat, workshopLng, Number(lat), Number(lng))
      );
      isWithinZone = true;
      const [h, m] = settings.workStartTime.split(":").map(Number);
      const workStart = new Date(now);
      workStart.setHours(h!, m!, 0, 0);
      const graceEnd = new Date(workStart.getTime() + settings.graceMinutes * 60000);
      status = now <= graceEnd ? "on-time" : "late";
    } else if (settings.isActive && lat != null && lng != null) {
      const [h, m] = settings.workStartTime.split(":").map(Number);
      const workStart = new Date(now);
      workStart.setHours(h!, m!, 0, 0);
      const graceEnd = new Date(workStart.getTime() + settings.graceMinutes * 60000);
      status = now <= graceEnd ? "on-time" : "late";
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

// ── GET /attendance/failed-attempts ──────────────────────────────────────────
router.get("/attendance/failed-attempts", requireAdminOrManager, async (req, res) => {
  try {
    const { date } = req.query as { date?: string };
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = date ?? today;

    const attempts = await db
      .select({
        id: failedCheckInAttemptsTable.id,
        workerId: failedCheckInAttemptsTable.workerId,
        workerName: workersTable.name,
        checkDate: failedCheckInAttemptsTable.checkDate,
        attemptedAt: failedCheckInAttemptsTable.attemptedAt,
        reason: failedCheckInAttemptsTable.reason,
        lat: failedCheckInAttemptsTable.lat,
        lng: failedCheckInAttemptsTable.lng,
        distanceMeters: failedCheckInAttemptsTable.distanceMeters,
      })
      .from(failedCheckInAttemptsTable)
      .innerJoin(workersTable, eq(failedCheckInAttemptsTable.workerId, workersTable.id))
      .where(eq(failedCheckInAttemptsTable.checkDate, targetDate))
      .orderBy(desc(failedCheckInAttemptsTable.attemptedAt));

    res.json(attempts);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to fetch failed attempts" });
  }
});

// ── PUT /attendance/workers/:id/mode ─────────────────────────────────────────
router.put("/attendance/workers/:id/mode", requireAdminOrManager, async (req, res) => {
  try {
    const workerId = Number(req.params.id);
    const { mode } = req.body as { mode?: string };
    const allowed = ["required", "optional", "exempt"];
    if (!mode || !allowed.includes(mode)) {
      res.status(400).json({ error: "mode must be one of: required, optional, exempt" });
      return;
    }
    const [updated] = await db
      .update(workersTable)
      .set({ attendanceMode: mode })
      .where(eq(workersTable.id, workerId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Worker not found" });
      return;
    }
    res.json(updated);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to update attendance mode" });
  }
});

// ── GET /attendance/today ─────────────────────────────────────────────────────
router.get("/attendance/today", requireAdminOrManager, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const workers = await db
      .select()
      .from(workersTable)
      .where(and(eq(workersTable.active, true)));
    const records = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.checkDate, today));

    const recordByWorker = new Map(records.map((r) => [r.workerId, r]));

    const result = workers
      .filter((w) => w.attendanceMode !== "exempt")
      .map((w) => {
        const record = recordByWorker.get(w.id);
        return {
          workerId: w.id,
          workerName: w.name,
          attendanceMode: w.attendanceMode,
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
