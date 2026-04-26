import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, authUsersTable, workersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

export async function seedAdminAccount() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "session" (
       "sid" varchar NOT NULL COLLATE "default",
       "sess" json NOT NULL,
       "expire" timestamp(6) NOT NULL,
       CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
     ) WITH (OIDS=FALSE)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`
  );

  const [existing] = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.role, "admin"));
  if (!existing) {
    const passwordHash = await bcrypt.hash("admin123", 12);
    await db.insert(authUsersTable).values({
      username: "admin",
      passwordHash,
      workerId: null,
      role: "admin",
      mustChangePassword: true,
    });
    console.log("Created default admin account: admin / admin123 (please change password)");
  }
}

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.username, username.trim().toLowerCase()));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  req.session.role = user.role as "admin" | "worker";
  req.session.workerId = user.workerId;
  req.session.username = user.username;

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    workerId: user.workerId,
    mustChangePassword: user.mustChangePassword,
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.id, req.session.userId));

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let workerName: string | null = null;
  if (user.workerId) {
    const [w] = await db.select({ name: workersTable.name }).from(workersTable).where(eq(workersTable.id, user.workerId));
    workerName = w?.name ?? null;
  }

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    workerId: user.workerId,
    workerName,
    mustChangePassword: user.mustChangePassword,
  });
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const [user] = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.id, req.session.userId!));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (currentPassword) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(authUsersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(authUsersTable.id, user.id));

  res.json({ ok: true });
});

router.get("/admin/credentials", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: authUsersTable.id,
      username: authUsersTable.username,
      role: authUsersTable.role,
      workerId: authUsersTable.workerId,
      mustChangePassword: authUsersTable.mustChangePassword,
      createdAt: authUsersTable.createdAt,
      workerName: workersTable.name,
    })
    .from(authUsersTable)
    .leftJoin(workersTable, eq(authUsersTable.workerId, workersTable.id))
    .orderBy(authUsersTable.createdAt);

  res.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    workerId: r.workerId,
    workerName: r.workerName ?? null,
    mustChangePassword: r.mustChangePassword,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/admin/credentials", requireAdmin, async (req, res) => {
  const { workerId, username, password } = req.body as {
    workerId?: number;
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  if (!workerId) {
    res.status(400).json({ error: "workerId is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.username, username.trim().toLowerCase()));
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [row] = await db.insert(authUsersTable).values({
    username: username.trim().toLowerCase(),
    passwordHash,
    workerId,
    role: "worker",
    mustChangePassword: false,
  }).returning();

  res.status(201).json({
    id: row!.id,
    username: row!.username,
    role: row!.role,
    workerId: row!.workerId,
    mustChangePassword: row!.mustChangePassword,
  });
});

router.put("/admin/credentials/:id/reset-password", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body as { password?: string };

  if (!password || password.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [row] = await db.update(authUsersTable)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(authUsersTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ ok: true, mustChangePassword: true });
});

router.delete("/admin/credentials/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(authUsersTable).where(eq(authUsersTable.id, id));
  res.status(204).end();
});

export default router;
