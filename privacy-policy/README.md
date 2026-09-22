# CoGG Safe — Privacy Policy site

A single static page (`index.html`) ready to deploy on Vercel, independent of the backend and frontend.

## Deploy on Vercel

**Option A — Vercel CLI**
```bash
cd privacy-policy
npx vercel --prod
```

**Option B — Vercel dashboard**
1. Push this repo to GitHub (already done if you followed the earlier steps).
2. In Vercel: **Add New → Project → Import** your GitHub repo.
3. Set **Root Directory** to `privacy-policy`.
4. Framework preset: **Other** (it's a static HTML file, no build step needed).
5. Deploy. Vercel will give you a URL like `https://cogg-safe-privacy.vercel.app`.
6. (Optional) Add a custom domain/subdomain, e.g. `privacy.your-domain.com`, from the Vercel project settings.

Once deployed, put the live URL in:
- Google Play Console → App content → Privacy Policy
- The app's own settings/about screen, if you want to link it there too

## Before publishing: fill in the placeholders

Open `index.html` and replace every `[PLACEHOLDER]` (they're visually highlighted). Here's what you need to decide/collect first:

| Placeholder | What to provide |
|---|---|
| `[COMPANY_NAME]` | The legal name of the person/company operating the app (needed for Play Store, and for the "who is 'we'" question a privacy policy must answer) |
| `[EFFECTIVE_DATE]` | The date you publish/update this policy |
| `[CONTACT_EMAIL]` | A real, monitored email for privacy/data requests |
| `[COMPANY_ADDRESS]` | Optional but recommended — a mailing address, especially if you target EU users (GDPR) |
| `[MAX_LIVE_LOCATION_HOURS]` | Matches `LIVE_LOCATION_MAX_DURATION_HOURS` in the backend `.env` (default 3) |
| `[RETENTION_PERIOD]` | How long you plan to keep SOS records/media before deleting or anonymizing them — this is a decision you (and your client) need to make, not a technical fact |
| `[EMAIL_PROVIDER]` | Whichever you actually use: Resend, or your SMTP provider's name |
| `[HOSTING PROVIDER]` | Where the backend is hosted (e.g. Railway, Render, your own server) |
| `[Atlas / self-hosted]` | Where MongoDB runs |
| `[country/region ...]` | Where your database/storage/hosting actually store data — check each provider's dashboard/docs |
| Children's age wording | Your target audience and the age threshold that applies in the regions you operate in (commonly 13 in the US under COPPA, 16 in parts of the EU unless a member state sets it lower) |

## Why each of these matters (context)

- **Google Play requires a privacy policy URL** for any app requesting sensitive permissions (location, camera, microphone, SMS, phone, accessibility) — CoGG Safe requests all of these, so this is mandatory, not optional, for a Play Store listing.
- **The Accessibility Service permission** (used for the volume-button SOS trigger) gets extra scrutiny from Google's review team. Your privacy policy should clearly explain why it's used (Section 4 already does), and you'll also need to justify it separately inside Play Console's permissions declarations form.
- **Retention period** is a business decision, not something that can be inferred from the code — decide it with your client and keep the policy and your actual data-deletion practice in sync.
- If you operate in, or have users in, the **EU/UK (GDPR)**, **California (CCPA/CPRA)**, or other regions with their own privacy laws, consider having a lawyer review this template before publishing — it covers the standard sections but is not legal advice.

## Notes

- This page is fully static (no backend calls, no cookies, no tracking scripts) — nothing else to configure for it to work on Vercel.
- If you'd rather serve it from the existing backend instead of a separate Vercel project, you can copy `index.html` into `backend/src/public/` and add a route for it (e.g. `GET /privacy`) — say the word and this can be wired in that way instead.
