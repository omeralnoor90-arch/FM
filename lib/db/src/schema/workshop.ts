import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  date,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  currency: text("currency").notNull().default("USD"),
  cardFeePercent: numeric("card_fee_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("15"),
  defaultWorkerPercent: numeric("default_worker_percent", {
    precision: 6,
    scale: 3,
  })
    .notNull()
    .default("50"),
  defaultWorkshopPercent: numeric("default_workshop_percent", {
    precision: 6,
    scale: 3,
  })
    .notNull()
    .default("50"),
});

export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  workerPercent: numeric("worker_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("50"),
  workshopPercent: numeric("workshop_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("50"),
  equityPercent: numeric("equity_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("0"),
  active: boolean("active").notNull().default(true),
  attendanceMode: text("attendance_mode").notNull().default("required"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull().default("single"),
  workerId: integer("worker_id").references(() => workersTable.id, {
    onDelete: "set null",
  }),
  cashReceivedByWorkerId: integer("cash_received_by_worker_id").references(
    () => workersTable.id,
    { onDelete: "set null" },
  ),
  source: text("source").notNull(),
  paymentMethod: text("payment_method").notNull(),
  grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
  cardFeeAmount: numeric("card_fee_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  vatPaidByCustomer: boolean("vat_paid_by_customer").notNull().default(true),
  expensesTotal: numeric("expenses_total", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }).notNull(),
  workerShare: numeric("worker_share", { precision: 12, scale: 2 }).notNull(),
  workshopShare: numeric("workshop_share", { precision: 12, scale: 2 }).notNull(),
  plateNumber: text("plate_number"),
  carModel: text("car_model"),
  notes: text("notes"),
  workerPaid: boolean("worker_paid").notNull().default(false),
  status: text("status").notNull().default("approved"),
  submittedByWorkerId: integer("submitted_by_worker_id").references(
    () => workersTable.id,
    { onDelete: "set null" },
  ),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const jobWorkerSharesTable = pgTable("job_worker_shares", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  workerName: text("worker_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paid: boolean("paid").notNull().default(false),
});

export const jobExpenseLinesTable = pgTable("job_expense_lines", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paidByWorkerId: integer("paid_by_worker_id").references(
    () => workersTable.id,
    { onDelete: "set null" },
  ),
});

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  category: text("category").notNull(),
  workerId: integer("worker_id").references(() => workersTable.id, {
    onDelete: "set null",
  }),
  paidWith: text("paid_with").notNull(),
  invoiceObjectPath: text("invoice_object_path"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const jobAttachmentsTable = pgTable("job_attachments", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  label: text("label").notNull(),
  objectPath: text("object_path").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authUsersTable = pgTable("auth_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  workerId: integer("worker_id").references(() => workersTable.id, {
    onDelete: "cascade",
  }),
  role: text("role").notNull().default("worker"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workerPaymentsTable = pgTable("worker_payments", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  paid: boolean("paid").notNull().default(true),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workerAdjustmentsTable = pgTable("worker_adjustments", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'reimbursement' | 'deduction'
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workerDebtsTable = pgTable("worker_debts", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  collected: boolean("collected").notNull().default(false),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workerTransfersTable = pgTable("worker_transfers", {
  id: serial("id").primaryKey(),
  fromWorkerId: integer("from_worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  toWorkerId: integer("to_worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partsTable = pgTable("parts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  supplier: text("supplier"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 })
    .notNull()
    .default("1"),
  paidWith: text("paid_with").notNull(),
  jobId: integer("job_id").references(() => jobsTable.id, {
    onDelete: "set null",
  }),
  invoiceObjectPath: text("invoice_object_path"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const attendanceSettingsTable = pgTable("attendance_settings", {
  id: serial("id").primaryKey(),
  isActive: boolean("is_active").notNull().default(false),
  workStartTime: text("work_start_time").notNull().default("08:00"),
  graceMinutes: integer("grace_minutes").notNull().default(15),
  locationName: text("location_name").notNull().default("Workshop"),
  locationLat: doublePrecision("location_lat"),
  locationLng: doublePrecision("location_lng"),
  locationRadiusMeters: integer("location_radius_meters").notNull().default(200),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  checkDate: date("check_date").notNull(),
  checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull().defaultNow(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  distanceMeters: integer("distance_meters"),
  isWithinZone: boolean("is_within_zone"),
  status: text("status").notNull().default("present"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const failedCheckInAttemptsTable = pgTable("failed_check_in_attempts", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workersTable.id, { onDelete: "cascade" }),
  checkDate: date("check_date").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  distanceMeters: integer("distance_meters"),
});
