# ThreadsByJoe

Joe is an AI that writes your Threads posts and drafts replies to your commenters, in your voice. Three modes per account:

- **Manual**: Joe writes when you ask.
- **Copilot** (default): Joe drafts posts and replies; everything waits in an approval queue.
- **Auto**: Joe posts and answers praise and simple questions himself, inside caps and quiet hours. Complaints, leads, sensitive topics, hostile comments, spam and anything flagged always wait for a human.

Stack: Next.js 16 (App Router, server actions), TypeScript, SQLite (better-sqlite3), DeepSeek (OpenAI-compatible API) for text, Meta's official Threads API, Stripe for billing. A separate worker process runs the scheduler.

## Run it locally (dry run, no keys needed)

```bash
npm install
cp .env.example .env.local        # then set SESSION_SECRET and TOKEN_ENC_KEY (see the file)
# For a no-key demo also set:  LLM_MOCK=1  and keep DRY_RUN=1
npm run dev                        # terminal 1: web app on :3000
npm run worker                     # terminal 2: Joe's scheduler/poller
```

Sign up, open **Accounts**, click **Add demo account** (only offered while `DRY_RUN=1`). The demo account has a fake post with four comments (praise, a question, a prompt-injection attempt, a complaint) so you can watch Joe classify, draft, skip and queue them. Nothing reaches Threads in dry run.

Note: `next dev` and `npm run worker` do not read `.env.local` the same way. Export the variables in both shells, or use `node --env-file=.env.local`.

## Going live

1. **DeepSeek**: create an API key, set `DEEPSEEK_API_KEY`. Default model is `deepseek-flash` (check DeepSeek's pricing page, names change).
2. **Meta app**: at developers.facebook.com create an app with the **Threads use case**. Add:
   - redirect URI `APP_URL/api/threads/callback`
   - deauthorize callback `APP_URL/api/threads/deauthorize`
   - data deletion URL `APP_URL/api/threads/delete`
   - (optional) webhook `APP_URL/api/threads/webhook` with your `THREADS_WEBHOOK_VERIFY_TOKEN`, topic `replies`
   - permissions: `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`
   - Set `THREADS_APP_ID` and `THREADS_APP_SECRET`.
   - Until Meta approves the permissions you can use the app with your own account and added Threads testers only. Submit for App Review (screencast, privacy policy at `/privacy`, terms at `/terms`) before selling.
3. **Stripe** (optional): create three monthly prices, set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_CREATOR|PRO|AGENCY`, and point a webhook at `APP_URL/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.updated|deleted` (`STRIPE_WEBHOOK_SECRET`). Without Stripe configured every account gets Pro limits.
4. Set `DRY_RUN=0`, `APP_URL` to your https URL, a long random `SESSION_SECRET`, and a 32-byte `TOKEN_ENC_KEY`. Set `CONTACT_EMAIL`. Optionally `ALLOW_SIGNUP=0` to close sign-ups.
5. Run `npm run build && npm start` and `npm run worker` as two long-lived processes on a host with a persistent disk (SQLite file at `DATABASE_PATH`). Back the file up.

## Safety model

- Every draft passes hard checks (500-char limit, banned terms, link allowlist and 5-link limit, near-duplicate detection, AI-boilerplate detection, no email/phone in replies). Failing drafts are never sent; a failed reply draft is parked for a human with the reasons.
- Soft flags (risky claim wording, statistics, shouting) force approval even in Auto.
- Auto-approved work obeys daily post/reply caps, quiet hours, minimum gap between posts, random reply delays, and goes out one item at a time. Human-approved work is not throttled.
- Comments are untrusted input: instruction-like comments are skipped without ever reaching the model; others are passed as quoted data only.
- Publishing is two-phase (container then publish) with the container id persisted, so retries cannot double-post.
- Per-account pause, global operator kill switch, full audit log, tokens encrypted with AES-256-GCM, passwords hashed with scrypt, login rate limiting, Stripe and Meta signatures verified.

## What has and has not been tested

Verified: 36 unit and integration tests (`npm test`) covering the safety gate, time zones, reply pipeline, pacing, caps, publishing idempotency, kill switch, tenancy checks and plan limits; production build; a browser run through signup, demo account, generation, approval, replies, mode switching and publishing in dry run with the mock model.

**Not yet verified against live services:** real Threads OAuth and publishing, the Threads reply endpoints, real DeepSeek output quality, Stripe checkout and webhooks. Endpoint shapes follow Meta's documentation read on 2026-10-21, but expect small fixes on first live contact. Test with your own account and `DRY_RUN=0` before inviting anyone.

## Layout

```
app/            pages, server actions (app/actions.ts), API routes (Threads OAuth/callbacks, Stripe webhook)
lib/engine.ts   Joe's scheduler, poller, publishing, caps
lib/safety.ts   pure safety gate and dispositions
lib/joe.ts      prompts and generation
lib/threads.ts  Threads API client
lib/llm.ts      DeepSeek client (swap by changing base URL/model)
worker/         long-running process calling engine.tick() every 30s
tests/          vitest
```
