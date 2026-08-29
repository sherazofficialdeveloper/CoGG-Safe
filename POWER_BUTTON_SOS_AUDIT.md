# Power-Button SOS Audit

## Scope

This document is a feasibility audit only. No application behavior changes were made.

The goal was to determine whether a standard Android third-party app can reliably detect 5 rapid physical power-button presses and route that signal into the existing SOS workflow without creating a separate SOS implementation.

---

## 1. Executive conclusion

### Is 5× power-button detection possible on standard Android third-party apps?

No, not in a universal, reliable, public-API way for normal consumer Android devices.

This is the critical finding: Android does not provide a standard, consistent public API for a normal third-party app to detect a physical power-button press sequence such as 5 rapid presses and treat it as a global emergency trigger while the device is locked or the app is in the background.

What does exist is:
- app-visible UI/input handling for key events only while the app is foregrounded and has focus
- OS-level broadcast hooks for some power/state events, but not a reliable 5-press count API
- OEM-specific or manufacturer-specific emergency features for selected devices
- enterprise/managed-device features such as device-owner or kiosk behavior that are not a general public app capability

This means the feature is not something the repository can safely claim as supported based on code inspection alone.

---

## 2. Current repository facts that matter

### React Native version and Android architecture

The app is using React Native 0.87.0 in [frontend/package.json](frontend/package.json).

The Android app is a standard React Native app with a Java/Kotlin native bridge, not a custom OEM wrapper:
- [frontend/android/app/src/main/java/com/coggsafe/MainApplication.kt](frontend/android/app/src/main/java/com/coggsafe/MainApplication.kt)
- [frontend/android/app/src/main/java/com/coggsafe/MainActivity.kt](frontend/android/app/src/main/java/com/coggsafe/MainActivity.kt)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt)
- [frontend/android/app/src/main/AndroidManifest.xml](frontend/android/app/src/main/AndroidManifest.xml)

The current native module is for emergency media and telephony only; it does not include any power-button monitoring, accessibility service, device admin, key listener, or broadcast receiver for hardware button presses.

### Existing SOS entry points

The manual SOS flow is intentionally implemented through the same existing orchestrator path:
- [frontend/App.js](frontend/App.js)
- [frontend/src/features/sos/orchestrator.js](frontend/src/features/sos/orchestrator.js)
- [frontend/src/permissions/sosPermissions.js](frontend/src/permissions/sosPermissions.js)
- [frontend/src/screens/UserHomeScreen.js](frontend/src/screens/UserHomeScreen.js)

The user-triggered SOS is initiated through the app UI and funnels into the single orchestrator: `activateSosFlow(...)`.

This is the required integration point for any future power-button trigger: it must route into the existing orchestrator, not create a separate workflow.

### Current native Android capabilities in the repo

The native Android module currently exposes media/telephony functions, not power-key detection:
- camera capture
- audio capture
- SIM-based SMS send
- device emergency call

Evidence:
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt)
- [frontend/src/features/sos/services/smsService.js](frontend/src/features/sos/services/smsService.js)
- [frontend/src/features/sos/services/callService.js](frontend/src/features/sos/services/callService.js)
- [frontend/src/features/sos/services/cameraService.js](frontend/src/features/sos/services/cameraService.js)
- [frontend/src/features/sos/services/audioService.js](frontend/src/features/sos/services/audioService.js)
- [frontend/src/features/sos/services/nativeMedia.js](frontend/src/features/sos/services/nativeMedia.js)

There is no Android service, broadcast receiver, accessibility service, device admin receiver, or manifest entry for power-button event interception.

---

## 3. Android APIs that are actually available

### Public app-level APIs that exist

These are the general Android capabilities available to a normal third-party app:
- `PermissionsAndroid` and runtime permissions in React Native / Android
- camera/audio/location permissions
- `SmsManager` / `TelecomManager` / `PhoneAccountHandle` when the app has the caller permission and device support
- `BroadcastReceiver` for system broadcasts such as screen state changes, boot, connectivity, etc.
- `ForegroundService` for long-running user-visible tasks
- Android accessibility APIs only when the user grants the app an accessibility service and the OS allows it
- device management APIs only in enterprise/managed-device scenarios, not general consumer app requirements

### What is not reliably available

A universal, public, consumer-app API for “5 rapid power-button presses” does not exist.

The app cannot rely on:
- a standard `KEYCODE_POWER` press counter API
- a system-wide event that tells a normal app: “power key was pressed 5 times rapidly”
- a guaranteed lockscreen or background listener for deliberate hardware button sequences

In Android, the power key is treated as a system/user-interaction input, not a generic app event that is exposed for third-party emergency apps.

### Why this is different from native media and telephony features

The current app’s native module works because it explicitly calls Android telephony and camera APIs with permission checks and user-device execution. That is a normal feature set. Power-button detection is different: it is not a permission-managed media or telephony action; it is hardware-system behavior that is not consistently surfaced to ordinary apps.

---

## 4. Android versions and affected support

This is not limited to one Android version. The limitation is architectural:
- older Android versions: device OEM and framework behavior varies substantially
- Android 10 / 11 / 12 / 13 / 14+: more restrictions around background execution, wake locks, lockscreen behavior, and OEM-specific handling
- Android 13+ also introduces stricter runtime notification and foreground-service rules

The problem is not a single version gap; it is that there is no universal public API for a normal app to observe a hardware power-button sequence reliably across devices.

---

## 5. OEM/device limitations

This feature is strongly subject to device-specific OEM behavior:

- many manufacturers reserve power-button behavior for their own emergency or accessibility features
- lockscreen and device-key handling is controlled by vendor firmware and framework layers
- OEM-specific emergency apps often have privileged access not exposed to third-party apps
- some devices expose “Emergency SOS” or emergency shortcuts at the system layer, but those are not public APIs for general app integration
- some manufacturers implement custom callbacks, but those are not cross-device and require vendor-specific code paths
- background execution and wake behavior are restricted heavily by Doze, app standby, OEM battery management, and lockscreen policies

The result is that even if a device supports a physical-button emergency action at the system level, a third-party app cannot assume it can tap into that capability in a portable way.

---

## 6. Native Android code requirement

### Is native Android code required?

Yes, if this feature is ever implemented on supported devices, it will require native Android code. There is no way to do this reliably from JavaScript alone.

But crucially:
- native code is required only as an implementation detail
- it does not imply a universal public API exists
- it only means the app may detect or consume an OEM/system capability where the device provides one

The current repo already has the right native boundary for Android-specific functionality:
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt)
- [frontend/android/app/src/main/java/com/coggsafe/MainApplication.kt](frontend/android/app/src/main/java/com/coggsafe/MainApplication.kt)

That is the correct place to add future native support if a device-specific capability is available.

---

## 7. Foreground/background service requirement

### Is a foreground/background service required?

Potentially yes, but only on the subset of devices where the OS allows it.

In general, a future implementation would likely need one of these patterns:
- foreground service for sustained detection while app is backgrounded
- system broadcast receiver for relevant power/screen lifecycle events
- OEM-specific listener if supported by the device
- accessibility service only if device-specific policy permits it and the user consents

However, this is not universally supported, and on many devices it is not practical or reliable while the screen is locked or the app is not foregrounded.

This feature cannot be treated as a simple React Native module feature; it is OS-level behavior with major platform restrictions.

---

## 8. Special permissions and privileges

### Permissions likely involved in a future implementation

Depending on the device and strategy, future native code may require some of the following:
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION` if location is involved while the app is backgrounded
- `POST_NOTIFICATIONS` for user-visible status or blocking notifications
- `RECEIVE_BOOT_COMPLETED` if the app must reattach after reboot
- `WAKE_LOCK` in limited cases

### Privileges that are not normal app capabilities

These are extremely important because they may be required only in special enterprise or OEM scenarios, not for standard third-party apps:
- accessibility service
- device owner / kiosk mode
- OEM privileged APIs
- manufacturer-specific emergency APIs
- device admin receiver

A normal consumer app should not assume these are available. In fact, many are intentionally unavailable to standard apps.

---

## 9. Can it work while the phone is locked?

### Realistic answer

Only on a subset of devices and only if the device vendor exposes some supported OS/OEM hook. For a normal third-party app, there is no reliable universal public API that guarantees this while locked.

Typical constraints:
- background execution restrictions
- lockscreen event handling varies by manufacturer
- the app may be stopped or killed when backgrounded
- Doze/app standby rules reduce reliability
- emergency or power-button shortcuts are often implemented in system firmware instead of public app APIs

So the correct answer is: not reliably, not universally, and not as a standard public Android feature.

---

## 10. SIM / SOS permissions impact

SIM and emergency/SMS permissions do not solve the power-button detection problem.

The current app’s native emergency features are based on real Android telephony and media APIs:
- [frontend/src/features/sos/services/smsService.js](frontend/src/features/sos/services/smsService.js)
- [frontend/src/features/sos/services/callService.js](frontend/src/features/sos/services/callService.js)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt)

Those permissions help with sending the emergency SMS or performing the emergency call after the SOS has already been triggered. They do not provide a general detection mechanism for physical power-button sequence counting.

So the power-button requirement is independent of SIM and emergency/safety permissions; it is primarily a hardware and OS capability problem.

---

## 11. Recommended architecture for a future implementation

If this feature is added later, the architecture should be:

Physical Power Button ×5
↓
Native Android capability detection only on supported devices
↓
RN bridge/native event only when supported
↓
Existing same SOS Orchestrator
↓
Existing SOS workflow

That architecture must avoid a separate implementation path.

### Correct later integration point

The event must be routed into the same existing orchestrator entry point used by the manual flow:
- [frontend/src/features/sos/orchestrator.js](frontend/src/features/sos/orchestrator.js)
- [frontend/App.js](frontend/App.js)

The future native Android bridge should emit an event that calls the same `activateSosFlow(...)` path used by the manual SOS button.

### Required safeguards

A future implementation must:
- detect actual device/API capability before enabling the feature
- never fake support on unsupported devices
- disable or ignore the feature when unsupported
- keep the manual SOS button working at all times
- avoid duplicate triggering using timestamp/debounce/idempotency checks
- respect the existing SOS state machine and cancellation logic
- not create a second SOS workflow

---

## 12. Exact files likely needing modification later

If implemented later, these are the likely files to touch in a future phase:

Android/native layer:
- [frontend/android/app/src/main/AndroidManifest.xml](frontend/android/app/src/main/AndroidManifest.xml)
- [frontend/android/app/src/main/java/com/coggsafe/MainApplication.kt](frontend/android/app/src/main/java/com/coggsafe/MainApplication.kt)
- [frontend/android/app/src/main/java/com/coggsafe/MainActivity.kt](frontend/android/app/src/main/java/com/coggsafe/MainActivity.kt)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaPackage.kt)
- [frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt](frontend/android/app/src/main/java/com/coggsafe/EmergencyMediaModule.kt)

RN bridge / orchestration integration:
- [frontend/App.js](frontend/App.js)
- [frontend/src/features/sos/orchestrator.js](frontend/src/features/sos/orchestrator.js)
- [frontend/src/features/sos/services/nativeMedia.js](frontend/src/features/sos/services/nativeMedia.js)

Manual SOS guards / UI state:
- [frontend/src/screens/UserHomeScreen.js](frontend/src/screens/UserHomeScreen.js)
- [frontend/src/permissions/sosPermissions.js](frontend/src/permissions/sosPermissions.js)

This list is a future design list only; no implementation was performed in this audit.

---

## 13. What should happen on unsupported devices

On unsupported devices, the correct behavior is:
- gracefully disable the feature
- do not advertise support
- do not emit false positives
- keep manual SOS available
- keep the existing workflow untouched
- surface a capability check only if there is actually a supported native hook

No “fake” support, no hidden capability assumptions, and no duplicate trigger path.

---

## 14. Code-level feasibility vs physical-device verification

### Android API capability

This is the technical capability question:
- Does Android expose a standard public API for 5 rapid power-button presses?
- Answer: No, not reliably and not universally.

### Code-level feasibility

This is the repository integration question:
- Can the app architecture accommodate such a feature later?
- Answer: Yes, in principle, but only as a native Android capability check plus a bridge event into the existing orchestrator.

### Real physical-device verification

This is the final validation question:
- Does a specific handset expose a supported feature in practice?
- Answer: This cannot be claimed from code inspection alone. It requires real hardware verification on the target device model and Android build.

This audit does not claim production support. It only documents the platform limitation and the correct future integration strategy.

---

## 15. No implementation made during this audit

No application source code was modified.

This audit only inspected:
- repository state
- existing SOS orchestrator structure
- Android manifest and native Java/Kotlin modules
- installed React Native dependencies and Android architecture
- Android capability boundaries and platform limitations

No power-button detection code, service, permission, or trigger was added.

---

## Final determination

5 rapid power-button detection is not a standard, reliable, public Android feature available to normal third-party apps across consumer devices.

A future implementation, if supported by a specific vendor/device, would require:
- native Android detection only on supported devices
- a capability check before enabling it
- graceful no-op on unsupported devices
- a bridge-trigger into the single existing SOS orchestrator
- no separate SOS path and no duplicate trigger logic

The manual SOS button must remain the primary supported path.
