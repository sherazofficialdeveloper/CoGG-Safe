# CoGG Safe — Production Fix Report v13

## Fixed

### 1. Splash screen
- Removed the outer rounded/shadowed white container that made the splash look like a card.
- Splash now uses the complete screen as the background while preserving the existing logo, animation, text and loading bar.

### 2. Audio unavailable on Admin/User screens
Root cause:
- The emergency-link browser can stream the token-gated audio URL directly.
- `react-native-sound` on Android was being handed the remote token URL directly. It cannot attach Authorization headers to protected URLs and remote token routes do not provide a reliable filename/extension for Android decoding.

Fix:
- Native media downloader now supports both public token-gated URLs and authenticated SOS media URLs.
- AudioPlayer always materializes remote audio into an app-private `.m4a` file first, then passes the local file to `react-native-sound`.
- This keeps the secure token route while removing Android remote-stream/header/extension dependency.

### 3. Admin/User images
Root cause:
- Active-state checks only recognized `active` and `Active`, so an equivalent status casing could incorrectly disable the public token media URL and force the authenticated fallback.
- Media upload/location controller responses also returned raw SOS objects without the same `emergencyMediaUrls` shape used by normal SOS detail responses.

Fix:
- Active checks are now case-insensitive in Admin SOS Detail, User SOS Active and User Notification Detail.
- Media upload/report and location responses now preserve the canonical emergency link/media URL shape.
- Existing authenticated image headers remain available as fallback.

### 4. Location acquisition
Root cause:
- The JS geolocation provider could wait for a provider callback and return no immediate fix even after permission was granted.
- Android's fused location provider is the same provider used by the live-location foreground service and is better suited to obtaining a fresh SOS fix.

Fix:
- Added a native fused `getCurrentLocation()` path.
- SOS location acquisition now tries the native fused current fix first, then keeps the existing JS best-available/high-accuracy/last-known/retry path.
- Live-location foreground service continues to push an immediately available cached fix and periodic fresh fixes.

Important Android limitation:
- Location permission and the device's Location Services switch are separate. A normal app cannot silently enable the system Location Services switch. If the user has turned system location off, Android must ask the user to enable it.

### 5. Call vs. audio/camera contention
Root cause:
- Call, audio and camera were originally started concurrently. On some Android devices a cellular call can take audio focus/microphone ownership while the 5-second emergency recording is still running.

Fix:
- SMS, camera and audio still start immediately and independently.
- The emergency call now waits only for the audio job to settle, or 6.5 seconds at most, and then starts.
- A camera failure, SMS delay or media-upload failure cannot block the call.
- The call is not tied to media upload completion.

### 6. Media upload independence
- Front image, back image and audio remain independently uploadable/retryable.
- One media component failing does not mark the other components as failed.
- Upload responses now return the same emergency media URL metadata used by detail screens.

## Verification
- All frontend/backend JavaScript files passed `node --check` (146 files checked).
- Android Gradle compilation was attempted but the environment could not download Gradle 9.4.1 because outbound DNS/network access was unavailable. Therefore native Kotlin compilation still needs to be verified on a development machine/device.

## Device acceptance test required
1. Trigger SOS with Location Services already ON.
2. Confirm initial location appears without opening the emergency link.
3. Confirm live location updates automatically.
4. Confirm front and back images appear on User SOS Active and Admin SOS Detail.
5. Confirm audio plays on User SOS Active and Admin SOS Detail.
6. Confirm emergency call starts after the audio capture window and is not blocked by media upload.
7. Repeat with Location Services OFF to confirm the app clearly prompts for the required system setting instead of pretending a GPS fix exists.
