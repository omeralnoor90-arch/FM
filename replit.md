# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

**Application**: Workshop Finance — a financial tracking web app for a workshop owner (~10 employees). Tracks job income, splits revenue between workers and workshop, handles VAT, expenses, file uploads, and more.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Custom username/password auth with express-session + connect-pg-simple + bcryptjs

## Key Features Added

- **Worker Adjustments**: Manual reimbursements and deductions per worker (`workerAdjustmentsTable`). Full CRUD on worker-detail page. These appear in the ledger as `expense_reimbursement` / `advance_deduction` entries and are factored into all balance calculations (ledger + analytics).

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Auth System

- Custom username/password authentication with PostgreSQL session storage
- Default admin account: **username: admin, password: admin123** (must change on first login)
- Sessions stored in `session` table (auto-created on startup)
- Auth users table: `auth_users` (id, username, password_hash, worker_id, role, must_change_password, created_at)
- Roles: `admin` (full access) | `worker` (portal only)
- Admin portal: full app with sidebar navigation
- Worker portal: simplified mobile-friendly view at `/portal`

## Database Schema (key tables)

- `workers` — employees
- `jobs` — job entries with worker assignments, payment method, VAT, cash receiver
- `job_worker_shares` — per-job worker revenue splits
- `job_expense_lines` — per-job expenses with paid-by tracking
- `expenses` — general expenses
- `parts` — parts/supplies
- `settings` — workshop configuration (VAT rate, workshop %, etc.)
- `auth_users` — user accounts for login
- `session` — express-session storage

## Important Notes

- Drizzle v0.45 does NOT export `alias` — use bulk lookup helpers instead
- API client hooks use `useListWorkers`, `useListJobs`, `useGetWorker` etc. (not `useGet*` for plural resources)
- Query key invalidation for workers uses predicate-based matching: `startsWith("/api/workers/")`
- Worker ledger page uses `staleTime: 0` + `refetchOnMount: "always"` for fresh data
- All API routes protected by `requireAuth` middleware (auth routes exempt)
- `customFetch` includes `credentials: "include"` for session cookie support
