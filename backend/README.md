# CoGG SOS Backend

Backend for the CoGG SOS Emergency Mobile Application.

## Status

This is being built in phases. Currently complete:

- **Phase 1 — Foundation**: project init, dependencies, environment configuration, MongoDB connection, centralized logging, centralized error handling, base Express app, folder architecture.
- **Phase 2 — Authentication & Authorization**: User model, login (username or email + password), password hashing, JWT issuance/verification, `authenticate`/`authorize` middleware, admin seed script, account-status enforcement, tests.
- **Phase 3 — Collections & Admin User Management**: Collection model/CRUD, admin-only user creation (role always forced server-side), user edit/password-reset/activate/deactivate/soft-delete, tests.
- **Phase 4 — SOS Engine / Core Emergency Workflow**: SOS state machine (pending/active/cancelled/deactivated), atomic cancellation-window activation with race-safe cancel, per-component status tracking, live location (start/ping/stop, 3-hour auto-expiry), secure emergency link (public, unauthenticated, active-only), notification data model + fan-out, dispatch orchestration behind provider abstractions, offline-sync idempotency, tests.
- **Phase 5 — Production Integrations**: durable MongoDB-backed scheduler (replaces Phase 4's in-process timers), real provider integrations behind the existing abstractions (SMTP via nodemailer, FCM via firebase-admin — each reports an explicit unsupported status when unconfigured), actual media upload/storage architecture (multer + local filesystem storage provider, secure authenticated + public token-gated retrieval), push-token/device registration (multi-device, upsert-by-token for logout/re-login handling, automatic stale-token cleanup), tests.
- **Phase 6 — Security & Architecture Audit**: full static verification (no broken imports, no circular deps, no duplicate routes, no controller-level DB access, no business-logic timers outside the scheduler, no logged secrets, env config fully synchronized). Found and fixed a path-traversal vulnerability in `storage.provider.js`.
- **Phase 7 — Production-Readiness Hardening**: fixed a dispatch-setup failure gap (a transient DB hiccup during dispatch's shared setup could leave every SOS component silently stuck at "pending" forever, un-retriable); hardened CORS (no more spec-invalid wildcard+credentials combination); added a database-aware `/api/health/ready` readiness endpoint distinct from the existing liveness check; added a graceful-shutdown force-exit safety timeout; added a boot-time diagnostic warning when running in production with unconfigured dispatch providers; added `passwordHash` to the logger's redaction list.

Not yet built: real cloud storage provider (S3/Firebase Storage — local filesystem is the only working `store()` implementation so far), WebSocket live-location push, offline-sync device-side logic, dispatch-provider retry strategy (deliberately left as an open decision — see below), full docs. See "Known limitations" below.

## Creating the first Admin account

There is no API for this by design. Run the seed script with the required
environment variables set (see `.env.example`):

```
ADMIN_SEED_USERNAME=admin \
ADMIN_SEED_PASSWORD='a-strong-password' \
ADMIN_SEED_MOBILE='03001234567' \
npm run seed:admin
```

Re-running it for a username that already exists is a safe no-op.

## Tech Stack

Node.js, Express.js, MongoDB/Mongoose, JavaScript (no TypeScript), JWT auth, bcryptjs, multer (media uploads), nodemailer (SMTP), firebase-admin (FCM push). Manual SOS SMS and calls are sent directly from the Android device using the native phone/SIM telephony stack.

## Project Structure

```
src/
  config/        # env, db connection, logger
  middlewares/   # error handling, validation, rate limiting, request logging
  modules/       # feature modules (auth, users, collections, sos, notifications, scheduler)
  services/      # provider abstractions (sms, email, call, storage, push)
  utils/         # ApiError, ApiResponse, asyncHandler, authz, pagination, etc.
  constants/     # roles, sos statuses, http status codes
  routes/        # route aggregation
  app.js         # Express app assembly (exported for tests)
  server.js      # entry point — DB connect, scheduler start, listen, graceful shutdown
```

## Getting Started

1. `npm install`
2. Copy `.env.example` to `.env` and fill in real values (never commit `.env`).
3. Make sure MongoDB is running and `MONGODB_URI` points to it.
4. `npm run dev` (or `npm start` for production).
5. Check `GET /api/health` for a liveness check.

## Environment Variables

See `.env.example` for the full list. `MONGODB_URI` and `JWT_SECRET` are required — the app refuses to boot without them (outside of `NODE_ENV=test`). SMTP and Firebase credentials are optional at boot: an unconfigured provider remains unavailable and is recorded as `unsupported`; no delivery is reported without a real provider response.

## Architecture Decisions

- **Provider abstraction**: SMS, Email, Storage, Call, and Push are never called directly from business logic. Each sits behind `src/services/<name>/*.provider.js` so the underlying vendor can be swapped without touching SOS logic — unconfigured providers report `unsupported` rather than claiming delivery.
- **Durable scheduler**: SOS activation and live-location expiry are driven by `src/modules/scheduler` — jobs are persisted in MongoDB (`ScheduledJob`) and claimed atomically by a poller, so they survive a server restart. `sos.service.js` only talks to the scheduler through `registerHandler`/`scheduleJob`/`cancelJobsForSos` and has no idea how jobs are actually run.
- **Role source of truth**: roles live only in the database and are read server-side after authentication.
- **Centralized error handling**: all errors flow through `src/middlewares/errorHandler.js`, including Multer upload errors (file-too-large, etc.) as of Phase 5.
- **Consistent response shape**: every success response is `{ success, message, data }`; every error is `{ success, message, error }`.
- **SOS is ID-centric**: notifications, media, and emergency links are all looked up/isolated by SOS ID, preventing data from leaking between concurrent emergencies.
- **Media never touches MongoDB as binary**: `sos.model.js` only stores a `storageRef`; the storage provider abstraction owns actual bytes.

## Testing

`npm test` (Jest). Test suite: `auth`, `authorization`, `collections`, `users`, `sos`, `scheduler`, `media`, `pushTokens`, `health`.

## Known limitations (Phase 5)

- **Only the `local` storage provider is implemented** (writes to disk under `STORAGE_LOCAL_PATH`). `s3`/`firebase` are recognized by config but throw a clear "not implemented" error if selected — a real cloud provider needs a new branch in `storage.provider.js`, with zero caller changes.
- **All real provider integrations (SMTP, FCM) are written against each service's documented API but have not been exercised against live accounts** — this build environment has no network access. Test with real credentials before production use.
- **Manual SOS SMS and calls are not backend-dispatched** — they are emitted directly from the Android device via native telephony (`SmsManager` and `ACTION_CALL`) using the device SIM and cellular network. Backend internet-dependent services remain separate from that native mobile path.
- **No device-token expiry beyond FCM-reported invalidity** — a token is only removed when the provider explicitly reports it as invalid/unregistered; there's no separate "stale after N days" sweep.
- **Notification/dispatch recipients** = all active admins + all other active members of the SOS creator's collection (unchanged from Phase 4, re-confirmed correct in the Phase 4 audit).
- **No dispatch-provider retry strategy** — a failed SMS/email/push/call send is recorded as `FAILED` and never automatically retried (the original spec explicitly prohibits automatic call retry; SMS retry is left as an open decision requiring your approval — see Phase 7 report). A one-off dispatch *setup* failure (fetching the user/collection/recipients) is now correctly recorded as `FAILED` on all four components rather than silently stuck at `pending` (fixed in Phase 7) — but per-channel send failures still don't auto-retry, by design.
