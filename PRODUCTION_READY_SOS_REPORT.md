# CoGG-Safe Production-Readiness Update

## Scope

This release hardens the complete SOS workflow around one local SOS event with independent services and persistent recovery. It does not change the client-required SIM behavior: **SMS and emergency calls continue to use physical SIM 1 automatically, with no SIM chooser and no fallback to another SIM**.

## Implemented

### 1. First SMS is trigger-critical
- The first SMS no longer waits for a live contacts API request.
- It uses the last-known local emergency-recipient cache.
- It no longer waits up to six seconds for GPS.
- If a valid location is already available, it is included immediately.
- If GPS is not ready, the independent location flow can send the location follow-up.
- SMS recipients are dispatched concurrently instead of sequentially.

### 2. Emergency SMS recipients include administrators
A dedicated `/contacts/emergency-sms` endpoint now returns:
- active administrators; and
- active users in the triggering user's collection, excluding the triggering user.

The normal Contacts screen/API keeps its previous semantics.

The recipient cache is refreshed in the background whenever authenticated internet connectivity is available, so this refresh can never block the emergency SMS path.

### 3. Offline SMS toggle is now functional
The Profile **Offline SMS Dispatch** switch is persistent and user-scoped.
- ON: primary SMS may send with cellular/SIM service even when internet is unavailable.
- OFF: primary SMS waits for internet connectivity.
- The selected value is snapshotted into each SOS event so changing the profile later cannot change an already-triggered SOS.

### 4. Offline profile emergency message sync
Emergency SMS profile edits are now stored under the authenticated user's own local key.
- Local UI updates immediately.
- Backend PATCH is attempted immediately.
- If offline, the update remains persistent locally.
- When internet returns, the App connectivity/queue processor automatically retries the update.
- Different users on the same device cannot accidentally consume each other's pending profile update.

### 5. Media uploads are independent
Front image, back image, and audio are no longer treated as one serial upload operation.
- Each component gets its own durable queue job.
- Already-captured media can upload as soon as the backend SOS exists.
- Camera and audio paths can start their own uploads independently.
- Reconnect processing can upload captured media in the same recovery pass.
- A missing/not-yet-written local file does not consume the media retry budget.
- Media upload state is merged into the latest local SOS instead of overwriting unrelated SOS updates.
- Multipart timeout increased from 90s to 120s; transient upload failures still retry.

### 6. Persistent connectivity-aware queue
Internet and cellular availability remain separate:
- Backend/media/email/notifications/live-location require internet.
- SMS/call/location-SMS require cellular service.
- SMS can therefore work while internet is down when the Profile toggle allows it.
- Internet-dependent work stays queued while offline and resumes after connectivity returns.
- Queue state survives app restart.

### 7. SIM requirement preserved
No production-readiness change was made to native telephony selection.
- SMS: physical SIM slot 1 only.
- Call: physical SIM slot 1 only.
- No SIM chooser.
- No silent SIM 2 fallback.

### 8. Release signing secret removed from source
The previously hardcoded release keystore password was removed from `frontend/android/gradle.properties`.
Release signing now reads credentials from Gradle properties or CI environment variables. A safe template is provided in `frontend/android/gradle.properties.example`.

**Important:** because the old release password was present in source, it should be considered exposed and rotated if it was a real production keystore credential.

## Validation performed

- All backend `src/**/*.js` files passed `node --check`.
- Changed non-JSX frontend JS modules passed `node --check`.
- The uploaded project contains no `node_modules`, so a full React Native Metro/Gradle/device build was not reproducible inside this audit environment.
- No claim is made that a physical-device build was executed here.

## Remaining deployment requirements

Before the production release build:

1. Put the real release signing values in the developer's user Gradle properties or CI secrets.
2. Verify the release keystore itself is kept outside source control.
3. Restrict the Google Maps Android API key in Google Cloud to the production package name and signing certificate.
4. Confirm Firebase/FCM production configuration is the intended project.
5. Perform physical-device tests for:
   - internet ON + SIM service ON;
   - internet OFF + SIM service ON;
   - internet ON + cellular service unavailable;
   - both unavailable;
   - app restart while SOS jobs are pending;
   - profile emergency-message edit while offline, then reconnect;
   - Offline SMS Dispatch ON/OFF;
   - SIM 1 SMS and SIM 1 call;
   - front/back image and 5-second audio upload recovery.

## Expected production behavior

`SOS Event -> Independent Services -> Persistent Queue -> Connectivity-aware retry/sync`

One service being unavailable must not mark the entire SOS as failed or block the other emergency services.
