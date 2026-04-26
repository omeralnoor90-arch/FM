import { Router, type IRouter } from "express";
import { db, jobAttachmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateJobAttachmentBody } from "@workspace/api-zod";

const router: IRouter = Router();

function serialize(r: typeof jobAttachmentsTable.$inferSelect) {
  return {
    id: r.id,
    jobId: r.jobId,
    purpose: r.purpose,
    label: r.label,
    objectPath: r.objectPath,
    originalName: r.originalName,
    mimetype: r.mimetype,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/jobs/:id/attachments", async (req, res) => {
  const jobId = Number(req.params.id);
  const rows = await db
    .select()
    .from(jobAttachmentsTable)
    .where(eq(jobAttachmentsTable.jobId, jobId));
  res.json(rows.map(serialize));
});

router.post("/jobs/:id/attachments", async (req, res) => {
  const jobId = Number(req.params.id);
  const body = CreateJobAttachmentBody.parse(req.body);
  const [row] = await db
    .insert(jobAttachmentsTable)
    .values({
      jobId,
      purpose: body.purpose,
      label: body.label,
      objectPath: body.objectPath,
      originalName: body.originalName,
      mimetype: body.mimetype,
    })
    .returning();
  res.status(201).json(serialize(row!));
});

router.delete("/jobs/:id/attachments/:attachmentId", async (req, res) => {
  const jobId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  await db
    .delete(jobAttachmentsTable)
    .where(
      and(
        eq(jobAttachmentsTable.jobId, jobId),
        eq(jobAttachmentsTable.id, attachmentId),
      ),
    );
  res.status(204).end();
});

export default router;
