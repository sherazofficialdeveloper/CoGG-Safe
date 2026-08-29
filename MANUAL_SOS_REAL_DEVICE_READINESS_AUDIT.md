# Manual SOS Real-Device Readiness Audit

## Scope

This audit inspected the current repository and the current manual SOS workflow without changing application behavior.

## Executive summary

The codebase contains a coherent manual SOS implementation that is structurally ready for real-device testing, but it is not physically verified on a real Android handset in this environment. The app successfully compiles and the frontend/backend tests cover the flow at a code level, but real Android permissions, SIM state, cellular access, microphone/camera behavior, and live device behavior remain unverified here.

## A. Code-level verified

### Android manifest and permissions
- [frontend/android/app/src/main/AndroidManifest.xml](frontend/android/app/src/main/AndroidManifest.xml) includes the required runtime permission declarations used by the current implementation:
  - ACCESS_FINE_LOCATION
  - CAMERA
  - RECORD_AUDIO
  - CALL_PHONE
  - SEND_SMS
  - READ_PHONE_STATE
  - READ_PHONE_NUMBERS
  - POST_NOTIFICATIONS
  - FOREGROUND_SERVICE
  - FOREGROUND_SERVICE_LOCATION
- The manifest is aligned with the permission model used by the JavaScript permission layer in [frontend/src/permissions/sosPermissions.js](frontend/src/permissions/sosPermissions.js).
- No broad additional dangerous permissions were added beyond what the current SOS services use.

### Runtime permissions and onboarding
- The permission onboarding logic in [frontend/src/permissions/sosPermissions.js](frontend/src/permissions/sosPermissions.js) is consistent with Android runtime permission checks.
- Trigger permissions are treated as the gating requirement for enabling the manual SOS button, while communication failures are handled as service-level failures instead of a hard block.
- This is a defensive design: the app can still start SOS processing even if SMS or call permissions are missing, and those service failures are reported as real outcomes rather than fake success.

### Native Android bridge
- The current bridge is implemented in [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt) and registered via [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt).
- Native functionality includes:
  - camera capture
  - audio capture
  - direct SMS dispatch via Android telephony APIs
  - direct emergency call launch via Android telephony APIs
- The native code checks permissions before invoking Android APIs and rejects with explicit errors when the device blocks the operation.

### Manual SOS orchestrator
- The manual SOS flow is routed through the single orchestrator in [frontend/src/features/sos/orchestrator.js](frontend/src/features/sos/orchestrator.js) and launched from [frontend/App.js](frontend/App.js).
- The orchestrator creates a local SOS record, enqueues retryable service jobs, writes local service states, and propagates backend IDs once the backend create call succeeds.
- It supports partial failure handling and service isolation without forcing a single service to make the entire SOS fail.
- It does not create a second SOS workflow.

### SMS behavior
- The service layer in [frontend/src/features/sos/services/smsService.js](frontend/src/features/sos/services/smsService.js) checks the Android permission and device connectivity before attempting native SMS.
- Native result values are treated as real statuses: SENT, PENDING, FAILED, UNSUPPORTED, NOT_CONFIGURED.
- The code does not treat a compose screen or a non-delivered message as a fake success.

### Emergency call behavior
- The service layer in [frontend/src/features/sos/services/callService.js](frontend/src/features/sos/services/callService.js) validates the phone number, permission, and cellular availability before launch.
- It resolves a preferred telephony account when Android exposes one, but it does not falsely claim a SIM-1 or telephony account when the OS did not expose that information.
- Successful launch is reported as launched by the device; it is not incorrectly reported as answered/connected.

### Camera/audio/location
- Real capture and recording are implemented in:
  - [frontend/src/features/sos/services/cameraService.js](frontend/src/features/sos/services/cameraService.js)
  - [frontend/src/features/sos/services/audioService.js](frontend/src/features/sos/services/audioService.js)
  - [frontend/src/features/sos/services/locationService.js](frontend/src/features/sos/services/locationService.js)
- The native camera/audio modules return real paths and failures rather than placeholders.
- Media upload logic is gated on backend id and connectivity in [frontend/src/features/sos/services/backendSyncService.js](frontend/src/features/sos/services/backendSyncService.js).

### Backend and notification flow
- Backend SOS persistence and admin deactivation logic are in the backend modules and tests.
- Notification lifecycle is handled by the existing backend notification system rather than a second app-side path.
- Admin flow remains consistent with the backend service logic and deactivation rules.

## B. Android build verified

### Verified result
- Android app build succeeded with:
  - `cd /d/CoGGSafe/frontend/android && ./gradlew assembleDebug`
- Result: BUILD SUCCESSFUL
- This confirms the current Android native module compiles with the current project configuration.

### Caveat
- A successful Gradle build is not the same as real-device runtime validation.
- It verifies compile-time compatibility only.

## C. Physical-device verified

### Status: NOT VERIFIED

This environment does not provide a physical Android device or an actively connected Android emulator available for runtime emergency behavior checks.

Therefore the following cannot be confirmed from this environment:
- actual permission prompts behavior on-device
- actual camera/microphone access at runtime
- actual SMS send success on a live SIM
- actual emergency call launch behavior on a device
- lockscreen/background behavior
- OEM-specific support or restrictions

## D. Backend/network verified

### Verified at code and test level
- Frontend tests pass: 9/9 suites, 56/56 tests.
- Backend tests pass for the SOS lifecycle: `tests/sos.test.js` passed.
- The backend test suite still has 3 failing tests unrelated to the manual SOS path:
  - `tests/pushTokens.test.js` (2 failures)
  - `tests/health.test.js` (1 failure)

### Important distinction
- The SOS flow is covered in backend tests and passed.
- Push notification and CORS configuration remain failing in this environment and are not a proof of full production readiness.

## E. External-provider verified

### Status: NOT FULLY VERIFIED

The app has external dependencies for:
- Firebase push notifications
- Twilio backend providers
- SMTP email
- mobile network connectivity

The repository includes the required provider abstractions, but real provider configuration and network connectivity were not validated here.

This means:
- code-level integration exists
- actual provider reachability and credentials were not verified in this environment

## Real-device requirements and constraints

### Minimum supported Android version
- The app currently targets Android SDK 36 and minSdk 24 as configured in [frontend/android/build.gradle](frontend/android/build.gradle).
- That suggests the app is designed for modern Android, but real device compatibility still requires OS-level runtime verification on target hardware.

### Required permissions
- ACCESS_FINE_LOCATION
- CAMERA
- RECORD_AUDIO
- SEND_SMS
- CALL_PHONE
- POST_NOTIFICATIONS (Android 13+)
- FOREGROUND_SERVICE / FOREGROUND_SERVICE_LOCATION if background location or live tracking is used while the app is not visible

### Physical SIM required?
- For native SMS and native emergency call, a real device with an active SIM or telephony path is strongly preferred.
- The app does not fake SMS/call success; it reports statuses based on Android results.

### Mobile network required?
- SMS requires cellular service for real send behavior.
- Emergency call requires cellular/mobile telephony capability.
- Backend SOS creation can work over Wi-Fi if the app has internet access and the backend is reachable.

### Wi-Fi sufficient for backend SOS creation?
- Yes, if the device has internet access and can reach the backend.
- Wi-Fi alone is not sufficient for sending real SMS or placing a real call.

### Dual-SIM testing setup
- Dual-SIM support is only possible if the device exposes a usable telephony account and Android provides a controllable account handle.
- The app attempts to prefer the first slot when available, but actual behavior depends on the OEM and OS implementation.

### Android Settings configuration
- User must grant runtime permissions in Settings if denied
- Battery optimization/background restrictions may affect background services and live location behavior
- The app should not assume full background continuity while locked or when the OS aggressively restricts background activity

### Battery optimization/background restrictions
- These may affect live location and delivery behavior even if the app code is correct.
- This is a real-device factor, not a code issue.

### Works while screen is locked?
- Code-level design: yes, for some lifecycle scenarios, but not guaranteed across all Android devices.
- Real-device verification is required.

## Blockers to full physical-device readiness

1. No actual Android handset or emulator was available in this environment.
2. Real SIM/network behavior remains unverified.
3. The backend test suite still has 3 failing tests unrelated to the SOS path.
4. Real provider connectivity (Firebase/Twilio/SMTP) remains unverified.

## Test evidence

### Frontend
Command run:
`cd /d/CoGGSafe/frontend && npm test -- --runInBand --watch=false`
Result:
- 9 passed suites
- 56 passed tests
- 0 failed

### Backend
Command run:
`cd /d/CoGGSafe/backend && npm test -- --runInBand`
Result:
- 7 passed suites
- 2 failed suites
- 126 passed tests
- 3 failed tests
- Failing suites: `tests/pushTokens.test.js`, `tests/health.test.js`

### Android build
Command run:
`cd /d/CoGGSafe/frontend/android && ./gradlew assembleDebug`
Result:
- BUILD SUCCESSFUL

## Files inspected
- [frontend/android/app/src/main/AndroidManifest.xml](frontend/android/app/src/main/AndroidManifest.xml)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt)
- [frontend/src/features/sos/orchestrator.js](frontend/src/features/sos/orchestrator.js)
- [frontend/App.js](frontend/App.js)
- [frontend/src/permissions/sosPermissions.js](frontend/src/permissions/sosPermissions.js)
- [frontend/src/features/sos/services/smsService.js](frontend/src/features/sos/services/smsService.js)
- [frontend/src/features/sos/services/callService.js](frontend/src/features/sos/services/callService.js)
- [frontend/src/features/sos/services/cameraService.js](frontend/src/features/sos/services/cameraService.js)
- [frontend/src/features/sos/services/audioService.js](frontend/src/features/sos/services/audioService.js)
- [frontend/src/features/sos/services/backendSyncService.js](frontend/src/features/sos/services/backendSyncService.js)
- [frontend/android/build.gradle](frontend/android/build.gradle)

## Exact next steps for manual real-device testing

1. Install the debug build on a physical Android device.
2. Grant all runtime permissions explicitly.
3. Confirm a real SIM is active and cellular service is available.
4. Confirm the backend is reachable over mobile data or Wi-Fi.
5. Test the manual SOS button while the screen is on and off to observe lockscreen/background behavior.
6. Confirm the backend SOS record is created.
7. Confirm camera/audio capture and file storage behavior.
8. Confirm SMS state is real and not assumed successful.
9. Confirm emergency call launch is real and not assumed successful.
10. Confirm live location and database notification flow.
11. Confirm admin dashboard and admin deactivation path.
12. Verify battery/background optimization restrictions on the target device.

## Final verdict

The implementation is code-level ready for physical-device testing, but it is not yet physically verified on an actual Android device. The current repository supports a coherent manual SOS flow and compiles successfully, but production confidence requires real-device runtime verification on the target handset.
