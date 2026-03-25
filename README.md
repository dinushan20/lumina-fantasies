# Lumina Fantasies

Consent-first infrastructure for premium AI storytelling, ethical digital twins, and subscription-based adult experiences.

## Structure

```text
.
|-- .env.example
|-- .env.production.example
|-- deploy
|-- docker-compose.yml
|-- package.json
|-- README.md
`-- apps
    |-- api
    |   |-- alembic/versions
    |   |-- app/api/routes
    |   |-- app/core
    |   |-- app/db/models
    |   |-- app/schemas
    |   `-- app/services
    `-- web
        |-- app/api
        |-- app/dashboard
        |-- app/onboarding
        |-- app/pricing
        |-- components
        `-- lib
```

## What this sprint adds

- Persistent `auth_users` and `profiles` tables with onboarding preferences, consent score, Stripe fields, and subscription state.
- Postgres-backed chat sessions and messages for short-term companion memory.
- Closed-beta product polish:
  - public landing page at `/` with beta access capture
  - creator onboarding wizard at `/dashboard/creators/onboard`
  - dashboard feedback modal stored in Postgres
  - admin beta operations panel with analytics + creator invites
  - friendly `404`, `error`, and loading states
- Creator digital twin infrastructure:
  - `profiles.is_creator` gates creator tooling
  - `digital_twins` stores consented metadata only, never raw likeness files
  - `audit_logs` records twin creation, updates, deletion, and moderation review actions
- Audio narration infrastructure:
  - ElevenLabs-backed text-to-speech service with Redis clip caching
  - Premium/VIP-only narration for stories and chat
  - optional twin-specific `preferred_voice_id` overrides for approved creator twins
- Protected profile endpoints:
  - `GET /api/profile/me`
  - `POST /api/profile/onboarding`
- Protected chat endpoints:
  - `GET /api/chat/sessions`
  - `GET /api/chat/sessions/{session_id}`
  - `POST /api/chat/stream`
- Protected digital twin endpoints:
  - `POST /api/twins/upload`
  - `GET /api/twins/my-twins`
  - `GET /api/twins/public`
  - `GET /api/twins/{twin_id}`
  - `PATCH /api/twins/{twin_id}`
  - `DELETE /api/twins/{twin_id}`
- Admin moderation endpoints:
  - `GET /api/moderation/queue`
  - `GET /api/moderation/queue/{item_id}`
  - `POST /api/moderation/queue/{item_id}/review`
  - `POST /api/moderation/queue/escalate-stale`
- Protected payments endpoints:
  - `POST /api/payments/create-checkout`
  - `POST /api/payments/portal`
  - `POST /api/payments/webhook`
- Subscription-aware story generation:
  - stored hard limits and preferences are injected into the prompt
  - free tier is capped at 3 generations per day
  - audio narration is gated to Premium and VIP
- Streaming chat companion mode:
  - loads saved profile preferences and hard limits into the system prompt
  - keeps recent conversation context per session
  - moderates the incoming message, planned response, and final output before any streamed text reaches the user
  - applies hourly chat limits by subscription tier
  - optionally emits post-turn voice narration events for Premium/VIP users when voice mode is enabled in the client
- Digital twin creation and browse flows:
  - creators can submit consent-attested twin metadata from `/dashboard/creators`
  - admins review queued twin submissions in the same moderation queue as stories and chats
  - fans can browse approved twins on `/twins` and launch a twin-specific chat session from there
  - twin chats merge creator-approved persona traits and hard limits with the user's own stored boundaries
  - approved twins can override the default voice with `preferred_voice_id`
- Admin moderation queue:
  - stores flagged stories, chat replies, and digital twin submissions in a generic `moderation_queue` table
  - keeps raw queued output away from end users until an admin approves it
  - exposes an admin-only moderation dashboard at `/admin/moderation`
  - escalates stale pending items after 24 hours through a protected admin endpoint
- Beta operations infrastructure:
  - `feedback_items` stores dashboard feedback from signed-in beta users
  - `beta_access_requests` stores landing page waitlist / beta access requests
  - `creator_invites` stores unique creator onboarding links for admin outreach
  - `daily_usage_metrics` stores lightweight anonymized daily usage snapshots
- Clerk-backed production auth on the Next.js app, including:
  - deterministic UUID mapping from Clerk users into the FastAPI data model
  - 18+ confirmation stored in Clerk public metadata before any backend proxy request is allowed
  - admin access via Clerk public metadata with `AUTH_ADMIN_EMAILS` fallback
- Next.js pricing page, billing summary, onboarding persistence, chat workspace, creator twin tools, public twin browse page, and authenticated proxy routes to the backend.

## Environment

Copy the env file first:

```bash
cp .env.example .env
```

Important variables:

- `INTERNAL_API_SHARED_SECRET`: shared only between the Next.js server and FastAPI for authenticated proxy calls.
- `API_BASE_URL`: used by the Next.js server to talk to FastAPI.
- `WEB_APP_URL`: used by FastAPI when creating Stripe return URLs.
- `WEB_APP_URL`: also used when generating creator invite links.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: Clerk keys for the production-ready web auth flow.
- `AUTH_ADMIN_EMAILS`: comma-separated fallback emails that should receive the `admin` role even if Clerk metadata is not set yet.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: Stripe backend secrets.
- `STRIPE_PRICE_BASIC_ID`, `STRIPE_PRICE_PREMIUM_ID`, `STRIPE_PRICE_VIP_ID`: test-mode Stripe Price IDs.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`: default narration credentials for story/chat voice mode.
- `MODERATION_QUEUE_THRESHOLD`: responses below this score, or any flagged response, are held for human review.

## Production Auth

- The demo Auth.js credentials stub has been replaced with Clerk on the Next.js app.
- The browser authenticates with Clerk, but the FastAPI backend is still called through server-side Next.js proxy routes. The browser never talks to FastAPI with raw admin or billing secrets.
- Each Clerk user is mapped to a stable UUID inside the web app before requests reach FastAPI, which keeps the existing Postgres schema intact.
- Age verification is required before onboarding can save a profile or any protected backend endpoint can run. The confirmation is stored in Clerk public metadata as `luminaAgeVerified=true`.
- Admin access can be granted in either of these ways:
  - set Clerk public metadata `luminaRole=admin`
  - add the email to `AUTH_ADMIN_EMAILS` as a fallback
- Backend admin endpoints also respect the persisted `auth_users.role='admin'` database flag once a profile has been synced, which is useful for controlled operational overrides.
- Required Clerk setup for production:
  - create a Clerk app
  - set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
  - configure allowed redirect URLs for `WEB_APP_URL`
  - keep `/sign-in` and `/sign-up` enabled
  - for pre-approved adults or staff, set `luminaAgeVerified=true` in Clerk public metadata

## Setup

1. Start infrastructure:

```bash
docker compose up -d postgres redis
```

2. Install the API:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ./apps/api
```

3. Install the web app:

```bash
npm install
```

4. Run migrations:

```bash
cd apps/api
alembic upgrade head
cd ../..
```

5. Start both services:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --app-dir apps/api
```

```bash
npm run dev:web
```

## Stripe test-mode setup

Create three monthly recurring prices in Stripe test mode and put their IDs into `.env`:

- Basic: `$9/month`
- Premium: `$19/month`
- VIP: `$29/month`

This repo ships placeholder env names only. The actual Stripe Price IDs must come from your Stripe test account.

Useful local webhook command:

```bash
stripe listen --forward-to localhost:8000/api/payments/webhook
```

If Stripe CLI prints a signing secret, copy it into `STRIPE_WEBHOOK_SECRET`.

## API endpoints

- `GET /api/health`
- `GET /api/profile/me`
- `POST /api/profile/onboarding`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/{session_id}`
- `POST /api/chat/stream`
- `POST /api/twins/upload`
- `GET /api/twins/my-twins`
- `GET /api/twins/public`
- `GET /api/twins/{twin_id}`
- `PATCH /api/twins/{twin_id}`
- `DELETE /api/twins/{twin_id}`
- `POST /api/generate-story`
- `GET /api/story/{request_id}`
  - optional query string: `?audio=true`
- `GET /api/moderation/queue`
- `GET /api/moderation/queue/{item_id}`
- `POST /api/moderation/queue/{item_id}/review`
- `POST /api/moderation/queue/escalate-stale`
- `POST /api/payments/create-checkout`
- `POST /api/payments/portal`
- `POST /api/payments/webhook`
- `POST /api/chat/messages/{message_id}/audio`
- `POST /api/feedback`
- `POST /api/beta-access/request`
- `GET /api/admin/creator-invites`
- `POST /api/admin/creator-invites`
- `POST /api/creator-invites/{invite_token}/accept`
- `GET /api/admin/analytics/overview`

## How to run for beta

1. Start Postgres + Redis and install both the API and web dependencies.
2. Run `alembic upgrade head`.
3. Set:
   - Clerk keys in `.env`
   - `AUTH_ADMIN_EMAILS` to include your local admin email if you want fallback admin access
   - `WEB_APP_URL=http://localhost:3000`
   - Stripe + ElevenLabs values if you want subscriptions and voice in the beta run
4. Launch FastAPI and Next.js.
5. Sign up or sign in through Clerk, confirm 18+ status on `/onboarding`, then complete onboarding preferences.
6. For creator testing, either claim a creator invite or set `profiles.is_creator = true`.
7. For admin testing, set Clerk public metadata `luminaRole=admin` or rely on `AUTH_ADMIN_EMAILS`, then use `/admin/moderation`.

## Closed Beta Launch Checklist

- Live beta URL placeholder:
  - [https://beta.luminafantasies.example.com](https://beta.luminafantasies.example.com)
- Deployment complete checklist:
  - Vercel dashboard: [https://vercel.com/dashboard](https://vercel.com/dashboard)
  - Render dashboard: [https://dashboard.render.com](https://dashboard.render.com)
  - Clerk dashboard: [https://dashboard.clerk.com](https://dashboard.clerk.com)
  - Stripe dashboard: [https://dashboard.stripe.com](https://dashboard.stripe.com)
  - Confirm production env vars are loaded from [.env.production.example](/Users/dinushanmeeriyagalla/Documents/New_S_Project/.env.production.example) or [.env.production.template](/Users/dinushanmeeriyagalla/Documents/New_S_Project/.env.production.template)
  - Confirm the production domain, SSL, and Stripe webhook endpoint are all live before sending beta invites
- Seed the first 5-10 beta users:
  - Preferred: send them to `/` and have them submit the beta access form as either `Beta user` or `Creator`
  - Fast-track: insert rows directly into `beta_access_requests` for vetted emails, then give them private access instructions
  - If you need to mark a profile manually after signup, update `profiles.subscription_tier`, `profiles.subscription_status`, `profiles.is_creator`, or `auth_users.role` in Postgres
- Invite the first creators:
  - Sign in as an admin
  - Open `/admin/moderation`
  - Use the `Invite creators` panel to generate a unique onboarding link
  - Copy the invite URL and send it manually to vetted creators
  - Have creators open `/dashboard/creators/onboard?invite=...`, claim access, and submit their first twin
- Recommended beta-user scenarios:
  - New beta user: submit onboarding preferences, generate a story, open chat, hit a free-tier prompt, upgrade, then confirm voice + twin access unlocks
  - New creator: claim an invite, complete the onboarding wizard, submit a twin, wait for moderation approval, then browse `/twins` and test live chat with the approved twin
  - Admin reviewer: monitor `/admin/moderation`, review queued stories/chat/twins, generate creator invites, and spot-check analytics counts
- Deployment notes:
  - Set the production domain in `WEB_APP_URL`, `API_BASE_URL`, and `NEXT_PUBLIC_API_BASE_URL`
  - Put the app behind HTTPS with a valid SSL certificate
  - Set Clerk production keys and allowed redirect URLs before widening access beyond a tightly managed cohort
  - Use live Stripe keys and live price IDs
  - Set a strong `INTERNAL_API_SHARED_SECRET`
  - Set production ElevenLabs credentials
  - Run Postgres + Redis with backups, monitoring, and restricted network access
  - Re-run `alembic upgrade head` in production before opening beta signups
  - Configure the Stripe webhook endpoint against the deployed API URL
  - Keep `CORS_ORIGINS` pinned to the production frontend domain only
- Post-deploy verification:
  - Open `/api/health` on the API and confirm `environment=production` and the expected version
  - Confirm Vercel routes all protected browser traffic through the Next.js proxy routes
  - Sign up a fresh adult beta user, pass the age gate, and confirm `/api/profile/me` works only after age confirmation
  - Complete a Stripe live-mode checkout and verify the production webhook updates the profile
  - Trigger a queued moderation item and confirm `/admin/moderation` can review it without exposing raw content to end users
  - As an admin, complete one first-story test, one first-chat test, and one approved-twin chat test after deployment

## Deployment

### Deploy the web app to Vercel

1. Create a Vercel project pointed at this repository.
2. Set the project Root Directory to `apps/web`.
3. Use the values from [deploy/vercel.json](/Users/dinushanmeeriyagalla/Documents/New_S_Project/deploy/vercel.json) or set equivalent commands manually:
   - Install Command: `cd ../.. && npm install`
   - Build Command: `cd ../.. && npm run build:web`
   - Output Framework: `Next.js`
4. Add the required web environment variables from [.env.production.example](/Users/dinushanmeeriyagalla/Documents/New_S_Project/.env.production.example).
5. In Clerk, add your production Vercel domain to the allowed redirect URLs and origin settings.
6. Point the custom beta domain to Vercel and enable SSL.

### Deploy the API to Render, Railway, or Fly.io

1. Provision managed Postgres and Redis first.
2. Deploy the FastAPI service with [deploy/Dockerfile.api](/Users/dinushanmeeriyagalla/Documents/New_S_Project/deploy/Dockerfile.api).
3. If you are using Render, [deploy/render.yaml](/Users/dinushanmeeriyagalla/Documents/New_S_Project/deploy/render.yaml) can be used as the starting blueprint.
4. Recommended Render settings:
   - Root Directory: `apps/api`
   - Build Command: `pip install -e .`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Set the required API environment variables from [.env.production.example](/Users/dinushanmeeriyagalla/Documents/New_S_Project/.env.production.example).
6. Restrict `CORS_ORIGINS` to the production frontend domain only.
7. Run migrations against the production database:

```bash
cd apps/api
alembic upgrade head
```

7. Verify the API at `https://your-api-domain.example.com/api/health`.

### Stripe, domains, and operational setup

1. Create live Stripe prices for Basic, Premium, and VIP, then set the live `STRIPE_PRICE_*` values.
2. Configure the production Stripe webhook to `https://your-api-domain.example.com/api/payments/webhook`.
3. Set `WEB_APP_URL`, `API_BASE_URL`, and `NEXT_PUBLIC_API_BASE_URL` to the final domains.
4. Keep `INTERNAL_API_SHARED_SECRET`, `CLERK_SECRET_KEY`, Stripe secrets, ElevenLabs secrets, and database credentials in platform secret storage only.
5. Keep TLS enabled end to end and lock down direct database access to trusted networks or private service connectors.

## Post-Launch Monitoring

- Vercel Analytics:
  - monitor landing-page conversion, protected-route performance, and client error spikes on the web app
- Render logs or your API host logs:
  - watch `/api/chat/stream`, `/api/generate-story`, Stripe webhook delivery, and any repeated 429 or 5xx patterns
- Postgres + Redis monitoring:
  - keep an eye on connection saturation, slow queries, and cache availability during the first creator/user sessions
- Clerk dashboard:
  - verify sign-in success, age-gate completions, and admin metadata configuration for beta staff
- Stripe dashboard:
  - verify live checkout completions, portal sessions, and webhook delivery health
- Sentry or a similar error tracker:
  - recommended next if you want centralized alerting for frontend and API exceptions during the closed beta

## Streaming chat notes

- The browser talks to `/api/chat/stream` through a Next.js authenticated proxy route.
- Streaming uses `fetch` plus `ReadableStream` parsing because the endpoint is a protected `POST`, not a public `GET` EventSource feed.
- Chat history is persisted in Postgres via `chat_sessions` and `chat_messages`, which keeps the MVP simple and durable without adding Redis session state yet.
- The backend moderates the user input, then a response preview, then the final assistant text before the UI receives any chunks.
- When voice mode is enabled client-side and the user is Premium or VIP, the backend emits an `audio_pending` SSE event followed by an `audio` event containing a narration data URL or an error.
- Chat audio is only generated after moderation clears the assistant turn, and no audio is rendered for queued or rejected replies.
- Approved assistant messages can also generate voice later through `POST /api/chat/messages/{message_id}/audio`, which powers the “Regenerate audio” control for past chat messages.
- When a `twin_id` is supplied, chat loads the approved digital twin metadata, merges creator-approved hard limits with the user's own boundaries, and blocks the turn if the viewer lacks the required subscription tier.

## Admin moderation notes

- Admin access can come from Clerk public metadata `luminaRole=admin`, `AUTH_ADMIN_EMAILS`, or a persisted `auth_users.role='admin'` override on the API side.
- Queued story outputs are stored in `moderation_queue.raw_output` and the user only sees a review placeholder until approval.
- Queued chat replies stream a gentle review placeholder instead of the original assistant text.
- Queued digital twins stay in `training` until an admin approves or rejects them.
- Approving a queue item updates the underlying story, chat message, or digital twin so it can surface to the end user.
- Rejecting a queue item keeps the raw content out of user-facing records and replaces it with a safe unavailable message.

## Digital twin notes

- The MVP stores consented metadata only:
  - voice style
  - optional preferred voice ID
  - personality traits
  - allowed kinks
  - hard limits
  - example prompts
- Raw images, video, and audio uploads are intentionally excluded from this implementation.
- Twin submissions always require explicit creator rights and likeness attestation.
- Each create, update, delete, or moderation review action writes an `audit_logs` record.

## Audio narration notes

- Story narration is returned inline as a data URL when audio is requested and the story is approved.
- `GET /api/story/{request_id}?audio=true` will render or fetch cached narration for an approved story if the viewer has Premium or VIP access.
- Chat voice mode is opt-in on the frontend and is only requested when the user enables the voice toggle.
- Redis caches rendered clips by text, voice ID, model, and format so repeated narration requests avoid fresh TTS cost.
- Daily fresh audio render limits are enforced by tier:
  - `premium`: 20 new clips/day
  - `vip`: 80 new clips/day
- Cached replays do not consume a new daily render slot.

## Local test flow

1. Sign up or sign in through Clerk.
2. Open `/onboarding`, confirm 18+ access, then save kinks, favorite genres, and hard limits.
3. Confirm persistence by visiting `/dashboard` or by opening `/api/profile/me` in the browser while you are signed in.
4. Use the dashboard `Feedback` button and confirm the note submits cleanly.
5. Open `/chat`.
6. Start a new conversation, send a first message, and confirm that the response streams in progressively.
7. Refresh or select the saved session from the sidebar and verify the last messages are still present.
8. Confirm the conversation respects your stored profile boundaries and preferred genres or tones.
9. If you are still on the free tier, keep chatting until the hourly limit is reached and verify the upgrade prompt appears.
10. Open `/pricing` and start a Stripe checkout for Basic, Premium, or VIP.
11. Complete checkout in Stripe test mode.
12. Let the webhook update the profile, then return to `/dashboard` or `/chat`.
13. Verify:
  - subscription tier and status are shown in the billing card
  - `Manage billing` opens Stripe Customer Portal
  - story generation uses saved profile boundaries and preferences
  - free tier stops after 3 generations/day
  - chat streams from `/chat` and uses the saved profile context
  - free tier chat limits are lifted or expanded based on the subscription tier
  - audio narration is blocked unless the profile is Premium or VIP

## Audio narration test flow

1. Add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to `.env`.
2. Restart the API after updating `.env`.
3. Upgrade the signed-in user to Premium or VIP through `/pricing`, or update the profile tier directly in Postgres for local testing.
4. Generate a story with narration enabled from `/dashboard`.
5. Confirm the result shows `Play narration`, then click it and verify the clip plays.
6. Refresh the same story with `GET /api/story/{request_id}?audio=true` and confirm the clip is still available without regenerating text.
7. Open `/chat`, enable voice mode, and send a message.
8. Confirm the text streams first, then the voice button resolves once the `audio` SSE event arrives.
9. If a twin has `preferred_voice_id`, start chat from `/twins` and confirm the rendered voice uses the twin override instead of the default voice.
10. Disable voice mode and confirm chat still works in text-only mode.
11. Switch the user back to `free` or `basic` and confirm voice mode shows an upgrade prompt instead of generating audio.

## Digital twin test flow

1. Sign in through Clerk and finish the age-gated onboarding flow.
2. Either:

   - claim a creator invite link from `/dashboard/creators/onboard?invite=...`
   - or, in Postgres, mark the profile as a creator:

```sql
update profiles
set is_creator = true
where user_id = (select id from auth_users where email = 'creator@example.com');
```

3. Open `/dashboard/creators/onboard`.
4. Finish the rules checklist, submit the guided twin form, and confirm the success screen appears.
5. Open `/dashboard/creators` and confirm the twin shows as `training` / `pending`.
6. Make sure the reviewer has Clerk public metadata `luminaRole=admin` or appears in `AUTH_ADMIN_EMAILS`, then open `/admin/moderation`.
7. Use the beta operations panel to generate a creator invite if you want to test the invite flow separately.
8. Review the queued `digital_twin` item and approve it.
9. Return to `/dashboard/creators` and confirm the twin shows as `active` / `approved`.
10. Open `/twins` and confirm the approved twin appears in the public catalog, including kink-tag filters and featured cards.
11. If the twin requires a paid tier, upgrade through `/pricing` first or lower the required tier to `free` for local testing.
12. Click `Chat with Twin`, send a first message, and confirm:
  - the reply streams in progressively
  - the twin name is locked into the session
  - the response reflects creator-approved personality traits and kinks
  - both the creator hard limits and the user's own profile boundaries are respected
13. Use `Regenerate audio` on an approved assistant message and confirm the clip returns only for Premium/VIP access.
14. Update the twin from `/dashboard/creators` and confirm it returns to review before going live again.

## Admin moderation test flow

1. In `.env`, make sure `AUTH_ADMIN_EMAILS` includes the admin email, or set Clerk public metadata `luminaRole=admin`.
2. Restart the web app if you changed `AUTH_ADMIN_EMAILS`.
3. Sign in and confirm the dashboard shows the `Admin` section.
4. To force a queued review, do one of these:
  - temporarily set `MODERATION_QUEUE_THRESHOLD=100` and restart the API
  - or submit a safe but review-worthy prompt mentioning a power-dynamic keyword like `boss` or `coworker`, which adds a moderation flag without triggering a hard block
5. Generate a story, send a chat message, or submit a digital twin.
6. Confirm the end user sees a review placeholder instead of the raw queued content.
7. Open `/admin/moderation`.
8. Review the pending item, add notes, set a final score, then approve or reject it.
9. Use the beta operations panel on the same page to confirm:
   - analytics cards render
   - creator invite generation works
   - copied invite links point to `/dashboard/creators/onboard`
10. For stories, return to `/dashboard` and use the story refresh control to confirm approved content becomes visible or rejected content stays unavailable.
11. For chat, return to `/chat`, reload the session, and confirm approved content appears while rejected content remains replaced by the safe placeholder.
12. For digital twins, return to `/dashboard/creators` or `/twins` and confirm approved twins go live while rejected twins stay unavailable.
13. Optionally click `Escalate stale` after aging a pending item or temporarily adjusting timestamps in Postgres for testing.

## Closed beta landing-page test flow

1. Open `/` while signed out.
2. Confirm the landing page renders the hero, trust points, pricing teaser, and beta access form.
3. Submit the waitlist form once as `Beta user` and once as `Creator`.
4. Confirm the request stores cleanly and shows a friendly success state.
5. Verify social preview metadata by checking the page source or Next metadata output for `openGraph` tags.

## Notes on safety

- Story generation still runs through request moderation, response moderation, and consent scoring.
- Chat companion mode applies moderation to the incoming user message, the planned response direction, and the final assistant content before streaming.
- Digital twin uploads run through consent attestation checks, moderation screening, the admin moderation queue, and audit logging before they become available.
- Audio narration is only generated from already-approved text. Queued, rejected, or withheld content never receives voice output.
- The admin moderation queue is the final release gate for any low-score or flagged output.
- Stored profile hard limits are merged into the system prompt before generation.
- Age verification remains required on the authenticated proxy path before the backend accepts profile, billing, or generation requests.

## Known limitations

- FastAPI currently trusts only the signed Next.js proxy boundary instead of verifying Clerk JWTs directly, which is appropriate for the web-only closed beta but not yet a public API-client model.
- Creator invite delivery is still copy-link based for the MVP and does not send real email yet.
- Analytics are intentionally lightweight daily snapshots rather than a full event or warehouse pipeline.
- Voice clips are delivered as inline data URLs and approved chat messages regenerate audio on demand instead of serving persisted media assets.
- Raw image, video, and voice-cloning asset uploads remain intentionally out of scope for this metadata-only twin MVP.
