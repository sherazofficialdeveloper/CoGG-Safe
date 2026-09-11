# CoGG-Safe UI Professionalization Update

## Scope
- User Home screen: intentionally unchanged.
- Login screen: intentionally unchanged to preserve client-approved requirements.
- Other user/admin UI: icons, typography readability, navigation, header controls, and visual color consistency improved.

## Implemented
- Replaced prototype-style emoji/Unicode UI icons with MaterialCommunityIcons through the existing shared `Icon` component.
- Redesigned User/Admin bottom navigation with consistent iconography, active states, spacing, touch targets, and brand colors.
- Replaced header profile/notification emoji controls with shared icons.
- Replaced symbol-based back/search/chevron/status/media/location/audio/action controls across user/admin screens.
- Increased small UI text sizes on non-Home/non-Login screens for better readability.
- Standardized common background, border, text, and muted colors across non-Home/non-Login screens.
- Updated the shared audio player to use the CoGG-Safe visual language instead of unrelated blue styling.
- Improved toast icon presentation and removed duplicated toast icon rendering.
- Kept existing SOS behavior, permissions, connectivity/queue logic, and SIM 1 native call/SMS behavior unchanged.

## Validation
- Backend JavaScript syntax check: passed.
- Non-JSX frontend JavaScript syntax check: passed.
- User Home source comparison against production-ready package: unchanged.
- Login source comparison against production-ready package: unchanged.
- Backend directory comparison against production-ready package: unchanged.
- No hardcoded release password remains in the working tree.
