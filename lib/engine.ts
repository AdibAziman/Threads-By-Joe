/**
 * Joe's engine. Every function takes `now` so behavior is deterministic in tests.
 * Rules of the road:
 *  - Nothing Joe does on its own happens while the global kill switch is on or the account is not active.
 *  - Auto-approved work is subject to daily caps, quiet hours and spacing. Work a human approved is not throttled by those.
 *  - Publishing is two-phase (container, then publish) and the container id is persisted, so a retry never double-posts.
 */
import { audit, isKilled } from "./audit";
import { db, json, nowIso } from "./db";
import { randomId } from "./crypto";
import { classifyComment, draftReply, generatePostVariants, isPostKind, POST_KINDS, type PostKind } from "./joe";
import { assertCanGenerate, PlanLimitError, accountToken, getAccountById, getProfile, getRules, getUser, publishedPostsLast24h, recentPostTexts, recentReplyTexts, sentRepliesLast24h, lastPublishedAt, setAccountToken, type Account, type User } from "./store";
import { decidePost, decideReply, looksLikeInjection, runGate } from "./safety";
import * as threads from "./threads";
import { isQuietHours, jitterMs, upcomingSlots } from "./time";

const CONTAINER_WAIT_MS = 30_000; // Meta recommends ~30s between container and publish
const MAX_ATTEMPTS = 3;
const POLL_EVERY_MS = 5 * 60_000;
const PLAN_EVERY_MS = 60 * 60_000;
const REFRESH_WITHIN_MS = 10 * 86400_000;

type ContentRow = { id: string; account_id: string; kind: string; text: string; status: string; scheduled_at: string | null; created_by: string; approved_by: string | null; container_id: string | null; attempts: number; updated_at: string };
type ConvRow = { id: string; account_id: string; reply_id: string; root_post_id: string; post_text: string; username: string; text: string; class: string | null; risk: number | null; status: string; draft_text: string | null; send_after: string | null; approved_by: string | null; container_id: string | null; attempts: number; updated_at: string };

const iso = (d: Date) => d.toISOString();

// ---------------------------------------------------------------- content

export function createContent(accountId: string, kind: string, text: string, opts: { status: "draft" | "pending_approval" | "scheduled"; createdBy: "user" | "joe"; approvedBy?: "user" | "joe"; scheduledAt?: Date | null; flags?: string[] }): string {
  const id = randomId(10);
  const now = nowIso();
  db()
    .prepare("INSERT INTO content_items (id,account_id,kind,text,status,scheduled_at,created_by,approved_by,approved_at,risk_flags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, accountId, kind, text, opts.status, opts.scheduledAt ? iso(opts.scheduledAt) : null, opts.createdBy, opts.approvedBy ?? null, opts.approvedBy ? now : null, JSON.stringify(opts.flags ?? []), now, now);
  return id;
}

export async function generateVariantsFor(user: User, account: Account, kind: PostKind, topic: string | undefined, count = 3) {
  assertCanGenerate(user, "generate");
  const profile = getProfile(account.id);
  return generatePostVariants({ userId: user.id, accountId: account.id }, profile, kind, { topic, count, recent: recentPostTexts(account.id) });
}

export function userApprovePost(user: User, accountId: string, itemId: string, scheduledAt: Date | null, text?: string) {
  const item = ownedItem(user.id, accountId, itemId);
  if (!item) throw new Error("Not found");
  if (!["draft", "pending_approval", "scheduled", "failed"].includes(item.status)) throw new Error(`Cannot approve a ${item.status} post`);
  const profile = getProfile(accountId);
  const finalText = (text ?? item.text).trim();
  const gate = runGate(finalText, "post", profile, recentPostTexts(accountId).filter((t) => t !== item.text));
  // A human may override soft flags and near-duplicate warnings, but never hard limits like length or links off the allowlist.
  const hard = gate.hardFails.filter((f) => !f.startsWith("near-duplicate"));
  if (hard.length) throw new Error(`Blocked by safety checks: ${hard.join("; ")}`);
  db().prepare("UPDATE content_items SET text=?, status='scheduled', scheduled_at=?, approved_by='user', approved_at=?, risk_flags=?, attempts=0, last_error=NULL, updated_at=? WHERE id=?").run(finalText, iso(scheduledAt ?? new Date()), nowIso(), JSON.stringify(gate.flags), nowIso(), itemId);
  audit({ userId: user.id, accountId, actor: "user", action: "post.approved", detail: { itemId, scheduledAt: scheduledAt ? iso(scheduledAt) : "now" } });
}

export function userRejectPost(user: User, accountId: string, itemId: string) {
  const item = ownedItem(user.id, accountId, itemId);
  if (!item || ["published", "publishing"].includes(item.status)) throw new Error("Cannot reject this post");
  db().prepare("UPDATE content_items SET status='rejected', updated_at=? WHERE id=?").run(nowIso(), itemId);
  audit({ userId: user.id, accountId, actor: "user", action: "post.rejected", detail: { itemId } });
}

export function userUpdateDraft(user: User, accountId: string, itemId: string, text: string) {
  const item = ownedItem(user.id, accountId, itemId);
  if (!item || ["published", "publishing"].includes(item.status)) throw new Error("Cannot edit this post");
  db().prepare("UPDATE content_items SET text=?, updated_at=? WHERE id=?").run(text.trim(), nowIso(), itemId);
}

function ownedItem(userId: string, accountId: string, itemId: string): ContentRow | undefined {
  return db().prepare("SELECT ci.* FROM content_items ci JOIN accounts a ON a.id=ci.account_id WHERE ci.id=? AND ci.account_id=? AND a.user_id=?").get(itemId, accountId, userId) as ContentRow | undefined;
}

function ownedConv(userId: string, accountId: string, convId: string): ConvRow | undefined {
  return db().prepare("SELECT cv.* FROM conversations cv JOIN accounts a ON a.id=cv.account_id WHERE cv.id=? AND cv.account_id=? AND a.user_id=?").get(convId, accountId, userId) as ConvRow | undefined;
}

// ---------------------------------------------------------------- replies (user actions)

export async function userDraftReply(user: User, accountId: string, convId: string) {
  const conv = ownedConv(user.id, accountId, convId);
  if (!conv) throw new Error("Not found");
  if (!["new", "skipped", "pending_approval", "failed"].includes(conv.status)) throw new Error(`Cannot draft for a ${conv.status} reply`);
  const account = getAccountById(accountId)!;
  await classifyAndDraft(user, account, conv, "copilot", new Date(), true);
}

export function userApproveReply(user: User, accountId: string, convId: string, text?: string) {
  const conv = ownedConv(user.id, accountId, convId);
  if (!conv) throw new Error("Not found");
  const draft = (text ?? conv.draft_text ?? "").trim();
  if (!draft) throw new Error("Write a reply first");
  const profile = getProfile(accountId);
  const gate = runGate(draft, "reply", profile, recentReplyTexts(accountId).filter((t) => t !== conv.draft_text));
  const hard = gate.hardFails.filter((f) => !f.startsWith("near-duplicate"));
  if (hard.length) throw new Error(`Blocked by safety checks: ${hard.join("; ")}`);
  db().prepare("UPDATE conversations SET draft_text=?, status='approved', approved_by='user', send_after=?, attempts=0, last_error=NULL, updated_at=? WHERE id=?").run(draft, nowIso(), nowIso(), convId);
  audit({ userId: user.id, accountId, actor: "user", action: "reply.approved", detail: { convId } });
}

export function userIgnoreReply(user: User, accountId: string, convId: string) {
  const conv = ownedConv(user.id, accountId, convId);
  if (!conv || ["sent", "approved"].includes(conv.status)) throw new Error("Cannot ignore this reply");
  db().prepare("UPDATE conversations SET status='ignored', updated_at=? WHERE id=?").run(nowIso(), convId);
  audit({ userId: user.id, accountId, actor: "user", action: "reply.ignored", detail: { convId } });
}

export async function userHideReply(user: User, accountId: string, convId: string) {
  const conv = ownedConv(user.id, accountId, convId);
  const account = getAccountById(accountId);
  if (!conv || !account) throw new Error("Not found");
  await threads.hideReply(accountToken(account), conv.reply_id, true);
  db().prepare("UPDATE conversations SET status='ignored', updated_at=? WHERE id=?").run(nowIso(), convId);
  audit({ userId: user.id, accountId, actor: "user", action: "reply.hidden", detail: { convId } });
}

// ---------------------------------------------------------------- publishing

type Outcome = "published" | "waiting" | "retry" | "failed" | "auth" | "limit";

async function publishText(account: Account, text: string, replyToId: string | undefined, state: { containerId: string | null; updatedAt: string }, saveContainer: (id: string) => void, now: Date): Promise<{ outcome: Outcome; mediaId?: string; error?: string }> {
  const token = accountToken(account);
  try {
    let containerId = state.containerId;
    if (!containerId) {
      containerId = await threads.createTextContainer(token, text, replyToId);
      saveContainer(containerId);
      return { outcome: "waiting" };
    }
    if (now.getTime() - new Date(state.updatedAt).getTime() < CONTAINER_WAIT_MS) return { outcome: "waiting" };
    const mediaId = await threads.publishContainer(token, account.threads_user_id, containerId);
    return { outcome: "published", mediaId };
  } catch (e) {
    if (e instanceof threads.ThreadsApiError) {
      if (e.isAuth) return { outcome: "auth", error: e.message };
      if (e.isRateLimit) return { outcome: "limit", error: e.message };
      return { outcome: "retry", error: e.message };
    }
    return { outcome: "retry", error: e instanceof Error ? e.message : String(e) };
  }
}

function markNeedsReconnect(account: Account, why: string) {
  db().prepare("UPDATE accounts SET status='needs_reconnect' WHERE id=?").run(account.id);
  audit({ userId: account.user_id, accountId: account.id, actor: "system", action: "account.needs_reconnect", detail: { why } });
}

function autoThrottled(account: Account, now: Date, kind: "post" | "reply"): string | null {
  const rules = getRules(account.id);
  if (isQuietHours(now, rules.timezone, rules.quietStart, rules.quietEnd)) return "quiet hours";
  if (kind === "post") {
    if (publishedPostsLast24h(account.id) >= rules.dailyPostCap) return "daily post cap reached";
    const last = lastPublishedAt(account.id);
    if (last && now.getTime() - new Date(last).getTime() < rules.minGapMinutes * 60_000) return "minimum gap between posts";
  } else if (sentRepliesLast24h(account.id) >= rules.dailyReplyCap) return "daily reply cap reached";
  return null;
}

export async function publishDue(account: Account, now: Date) {
  const rows = db()
    .prepare("SELECT * FROM content_items WHERE account_id=? AND status IN ('scheduled','publishing') AND (scheduled_at IS NULL OR scheduled_at<=?) ORDER BY scheduled_at LIMIT 3")
    .all(account.id, iso(now)) as ContentRow[];
  let autoHandled = false; // Joe's own posts go out one at a time so caps and spacing are always re-checked
  for (const item of rows) {
    if (item.approved_by === "joe") {
      if (autoHandled || autoThrottled(account, now, "post")) continue; // stays queued; retried next tick
      autoHandled = true;
    }
    const current = getAccountById(account.id)!;
    if (current.status !== "active") return;
    db().prepare("UPDATE content_items SET status='publishing', attempts=attempts+ (CASE WHEN container_id IS NULL THEN 1 ELSE 0 END) WHERE id=? AND status IN ('scheduled','publishing')").run(item.id);
    const fresh = db().prepare("SELECT * FROM content_items WHERE id=?").get(item.id) as ContentRow;
    const r = await publishText(current, fresh.text, undefined, { containerId: fresh.container_id, updatedAt: fresh.updated_at }, (cid) => db().prepare("UPDATE content_items SET container_id=?, updated_at=? WHERE id=?").run(cid, iso(now), item.id), now);
    if (r.outcome === "published") {
      const permalink = await threads.getPermalink(accountToken(current), r.mediaId!);
      db().prepare("UPDATE content_items SET status='published', threads_media_id=?, permalink=?, published_at=?, last_error=NULL, updated_at=? WHERE id=?").run(r.mediaId, permalink ?? null, iso(now), iso(now), item.id);
      audit({ userId: account.user_id, accountId: account.id, actor: item.approved_by === "joe" ? "joe" : "user", action: "post.published", detail: { itemId: item.id, mediaId: r.mediaId, dryRun: threads.DEMO_TOKEN === accountToken(current) || undefined } });
    } else if (r.outcome === "auth") {
      db().prepare("UPDATE content_items SET status='scheduled', last_error=?, updated_at=? WHERE id=?").run(r.error ?? "auth", iso(now), item.id);
      markNeedsReconnect(current, r.error ?? "auth error while publishing");
      return;
    } else if (r.outcome === "limit") {
      db().prepare("UPDATE content_items SET last_error=?, scheduled_at=?, updated_at=? WHERE id=?").run(r.error ?? "rate limited", iso(new Date(now.getTime() + 15 * 60_000)), iso(now), item.id);
    } else if (r.outcome === "retry") {
      const failed = fresh.attempts + 1 >= MAX_ATTEMPTS;
      db().prepare("UPDATE content_items SET status=?, last_error=?, scheduled_at=?, updated_at=? WHERE id=?").run(failed ? "failed" : "scheduled", r.error ?? "error", iso(new Date(now.getTime() + 5 * 60_000 * (fresh.attempts + 1))), iso(now), item.id);
      if (failed) audit({ userId: account.user_id, accountId: account.id, actor: "system", action: "post.failed", detail: { itemId: item.id, error: r.error } });
    }
  }
}

// ---------------------------------------------------------------- planning

export async function planPosts(user: User, account: Account, now: Date) {
  const rules = getRules(account.id);
  if (!rules.autopilot || account.mode === "manual") return;
  if (account.last_plan_at && now.getTime() - new Date(account.last_plan_at).getTime() < PLAN_EVERY_MS) return;
  db().prepare("UPDATE accounts SET last_plan_at=? WHERE id=?").run(iso(now), account.id);

  const slots = upcomingSlots(now, rules.timezone, rules.postTimes, 2);
  const kinds = rules.postKinds.filter(isPostKind);
  const pool: PostKind[] = kinds.length ? (kinds as PostKind[]) : [...POST_KINDS];
  const profile = getProfile(account.id);
  let generated = 0;
  for (const [i, slot] of slots.entries()) {
    if (generated >= 2) break;
    const lo = iso(new Date(slot.getTime() - 45 * 60_000));
    const hi = iso(new Date(slot.getTime() + 45 * 60_000));
    const taken = db().prepare("SELECT COUNT(*) c FROM content_items WHERE account_id=? AND status IN ('scheduled','pending_approval','publishing','published') AND scheduled_at BETWEEN ? AND ?").get(account.id, lo, hi) as { c: number };
    if (taken.c > 0) continue;
    const kind = pool[(i + Math.floor(now.getTime() / 86400_000)) % pool.length];
    try {
      const variants = await generateVariantsFor(user, account, kind, undefined, 3);
      generated++;
      const pick = variants.find((v) => !v.gate.hardFails.length);
      if (!pick) {
        audit({ userId: user.id, accountId: account.id, actor: "joe", action: "post.generation_blocked", detail: { kind, reasons: variants.map((v) => v.gate.hardFails) } });
        continue;
      }
      const disposition = decidePost(account.mode, pick.gate);
      const jittered = new Date(slot.getTime() + jitterMs(8));
      if (disposition === "auto") createContent(account.id, kind, pick.text, { status: "scheduled", createdBy: "joe", approvedBy: "joe", scheduledAt: jittered, flags: pick.gate.flags });
      else createContent(account.id, kind, pick.text, { status: "pending_approval", createdBy: "joe", scheduledAt: slot, flags: pick.gate.flags });
      audit({ userId: user.id, accountId: account.id, actor: "joe", action: disposition === "auto" ? "post.auto_scheduled" : "post.queued_for_approval", detail: { kind, slot: iso(slot) } });
    } catch (e) {
      if (e instanceof PlanLimitError) {
        audit({ userId: user.id, accountId: account.id, actor: "system", action: "plan.limit", detail: { message: e.message } });
        return;
      }
      audit({ userId: user.id, accountId: account.id, actor: "system", action: "post.generation_error", detail: { error: e instanceof Error ? e.message : String(e) } });
      return;
    }
  }
}

// ---------------------------------------------------------------- replies (engine)

export async function pollReplies(account: Account, now: Date): Promise<number> {
  if (account.last_poll_at && now.getTime() - new Date(account.last_poll_at).getTime() < POLL_EVERY_MS) return 0;
  db().prepare("UPDATE accounts SET last_poll_at=? WHERE id=?").run(iso(now), account.id);
  const token = accountToken(account);
  let inserted = 0;
  try {
    const since = iso(new Date(now.getTime() - 7 * 86400_000));
    const posts = await threads.listMyThreads(token, since, 15);
    for (const post of posts) {
      const replies = await threads.listTopLevelReplies(token, post.id, 50);
      for (const r of replies) {
        if (r.isOwnedByMe || !r.text.trim()) continue;
        const res = db()
          .prepare("INSERT OR IGNORE INTO conversations (id,account_id,reply_id,root_post_id,post_text,username,text,reply_ts,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'new', ?, ?)")
          .run(randomId(10), account.id, r.id, post.id, post.text, r.username, r.text, r.timestamp, iso(now), iso(now));
        inserted += res.changes;
      }
    }
  } catch (e) {
    if (e instanceof threads.ThreadsApiError && e.isAuth) markNeedsReconnect(account, e.message);
    else audit({ userId: account.user_id, accountId: account.id, actor: "system", action: "poll.error", detail: { error: e instanceof Error ? e.message : String(e) } });
  }
  if (inserted) audit({ userId: account.user_id, accountId: account.id, actor: "system", action: "replies.fetched", detail: { count: inserted } });
  return inserted;
}

async function classifyAndDraft(user: User, account: Account, conv: ConvRow, mode: Account["mode"], now: Date, force = false) {
  const profile = getProfile(account.id);
  const rules = getRules(account.id);
  const touch = (sql: string, ...args: unknown[]) => db().prepare(sql).run(...args);

  if (looksLikeInjection(conv.text)) {
    touch("UPDATE conversations SET class='spam', risk=1, reason='instruction-like text in comment', status='skipped', updated_at=? WHERE id=?", nowIso(), conv.id);
    audit({ userId: user.id, accountId: account.id, actor: "joe", action: "reply.skipped_injection", detail: { convId: conv.id } });
    return;
  }
  assertCanGenerate(user, "reply");
  const cls = await classifyComment({ userId: user.id, accountId: account.id }, conv.post_text, conv.text);
  if (cls.cls === "spam" && !force) {
    touch("UPDATE conversations SET class=?, risk=?, reason=?, status='skipped', updated_at=? WHERE id=?", cls.cls, cls.risk, cls.reason, nowIso(), conv.id);
    return;
  }
  const recent = recentReplyTexts(account.id);
  const draft = await draftReply({ userId: user.id, accountId: account.id }, profile, conv.post_text, conv.text, conv.username, cls.cls, recent);
  const disposition = force ? "approval" : decideReply(mode, draft.gate, cls.cls, cls.risk, rules.autoReplyClasses, false);
  if (draft.gate.hardFails.length) {
    // A real comment should never vanish silently: park it for a human with the reasons, and the draft to edit.
    touch("UPDATE conversations SET class=?, risk=?, reason=?, status='pending_approval', draft_text=?, draft_flags=?, last_error=?, updated_at=? WHERE id=?", cls.cls, cls.risk, cls.reason, draft.text, JSON.stringify([...draft.gate.flags, ...draft.gate.hardFails.map((f) => `blocked: ${f}`)]), `Draft needs editing: ${draft.gate.hardFails.join("; ")}`, nowIso(), conv.id);
    return;
  }
  if (disposition === "auto") {
    const delayMin = rules.replyDelayMin + Math.random() * Math.max(0, rules.replyDelayMax - rules.replyDelayMin);
    const sendAfter = new Date(now.getTime() + delayMin * 60_000);
    touch("UPDATE conversations SET class=?, risk=?, reason=?, status='approved', approved_by='joe', draft_text=?, draft_flags=?, send_after=?, last_error=NULL, updated_at=? WHERE id=?", cls.cls, cls.risk, cls.reason, draft.text, JSON.stringify(draft.gate.flags), iso(sendAfter), nowIso(), conv.id);
    audit({ userId: user.id, accountId: account.id, actor: "joe", action: "reply.auto_approved", detail: { convId: conv.id, class: cls.cls } });
  } else {
    touch("UPDATE conversations SET class=?, risk=?, reason=?, status='pending_approval', draft_text=?, draft_flags=?, last_error=NULL, updated_at=? WHERE id=?", cls.cls, cls.risk, cls.reason, draft.text, JSON.stringify(draft.gate.flags), nowIso(), conv.id);
  }
}

export async function processNewConversations(user: User, account: Account, now: Date) {
  if (account.mode === "manual") return;
  const rows = db().prepare("SELECT * FROM conversations WHERE account_id=? AND status='new' ORDER BY created_at LIMIT 6").all(account.id) as ConvRow[];
  for (const conv of rows) {
    try {
      await classifyAndDraft(user, account, conv, account.mode, now);
    } catch (e) {
      if (e instanceof PlanLimitError) {
        audit({ userId: user.id, accountId: account.id, actor: "system", action: "plan.limit", detail: { message: e.message } });
        return;
      }
      db().prepare("UPDATE conversations SET attempts=attempts+1, last_error=?, status=CASE WHEN attempts+1>=? THEN 'failed' ELSE status END, updated_at=? WHERE id=?").run(e instanceof Error ? e.message : String(e), MAX_ATTEMPTS, nowIso(), conv.id);
    }
  }
}

export async function sendDueReplies(account: Account, now: Date) {
  const row = db()
    .prepare("SELECT * FROM conversations WHERE account_id=? AND status='approved' AND (send_after IS NULL OR send_after<=?) ORDER BY send_after LIMIT 5")
    .all(account.id, iso(now)) as ConvRow[];
  let autoHandled = false;
  for (const conv of row) {
    if (conv.approved_by === "joe") {
      if (autoHandled || autoThrottled(account, now, "reply")) continue;
      autoHandled = true;
    }
    const current = getAccountById(account.id)!;
    if (current.status !== "active" || !conv.draft_text) return;
    const r = await publishText(current, conv.draft_text, conv.reply_id, { containerId: conv.container_id, updatedAt: conv.updated_at }, (cid) => db().prepare("UPDATE conversations SET container_id=?, updated_at=? WHERE id=?").run(cid, iso(now), conv.id), now);
    if (r.outcome === "published") {
      db().prepare("UPDATE conversations SET status='sent', sent_reply_id=?, sent_at=?, last_error=NULL, updated_at=? WHERE id=?").run(r.mediaId, iso(now), iso(now), conv.id);
      audit({ userId: account.user_id, accountId: account.id, actor: conv.approved_by === "joe" ? "joe" : "user", action: "reply.sent", detail: { convId: conv.id, replyId: r.mediaId } });
    } else if (r.outcome === "auth") {
      markNeedsReconnect(current, r.error ?? "auth error while replying");
      return;
    } else if (r.outcome === "limit") {
      db().prepare("UPDATE conversations SET send_after=?, last_error=?, updated_at=? WHERE id=?").run(iso(new Date(now.getTime() + 15 * 60_000)), r.error ?? "rate limited", iso(now), conv.id);
    } else if (r.outcome === "retry") {
      const failed = conv.attempts + 1 >= MAX_ATTEMPTS;
      db().prepare("UPDATE conversations SET attempts=attempts+1, status=?, container_id=NULL, last_error=?, send_after=?, updated_at=? WHERE id=?").run(failed ? "failed" : "approved", r.error ?? "error", iso(new Date(now.getTime() + 5 * 60_000)), iso(now), conv.id);
    }
  }
}

// ---------------------------------------------------------------- tokens + tick

export async function refreshTokenIfNeeded(account: Account, now: Date) {
  if (!account.token_expires_at) return;
  const exp = new Date(account.token_expires_at).getTime();
  const refreshedAt = account.last_refresh_at ? new Date(account.last_refresh_at).getTime() : 0;
  if (exp - now.getTime() > REFRESH_WITHIN_MS || now.getTime() - refreshedAt < 86400_000) return;
  try {
    const r = await threads.refreshToken(accountToken(account));
    setAccountToken(account.id, r.accessToken, r.expiresAt);
    audit({ userId: account.user_id, accountId: account.id, actor: "system", action: "token.refreshed" });
  } catch (e) {
    if (e instanceof threads.ThreadsApiError && e.isAuth) markNeedsReconnect(account, e.message);
    else audit({ userId: account.user_id, accountId: account.id, actor: "system", action: "token.refresh_error", detail: { error: e instanceof Error ? e.message : String(e) } });
  }
}

export async function tick(now = new Date()): Promise<{ accounts: number; killed: boolean }> {
  if (isKilled()) return { accounts: 0, killed: true };
  const accounts = db().prepare("SELECT * FROM accounts WHERE status='active'").all() as Account[];
  for (const acc of accounts) {
    const user = getUser(acc.user_id);
    if (!user) continue;
    try {
      await refreshTokenIfNeeded(acc, now);
      const live = getAccountById(acc.id)!;
      if (live.status !== "active") continue;
      await publishDue(live, now); // user-approved items always flow, even in Manual mode
      await sendDueReplies(live, now);
      if (live.mode === "manual") continue;
      await planPosts(user, live, now);
      await pollReplies(live, now);
      await processNewConversations(user, live, now);
    } catch (e) {
      audit({ userId: acc.user_id, accountId: acc.id, actor: "system", action: "tick.error", detail: { error: e instanceof Error ? e.message : String(e) } });
    }
  }
  return { accounts: accounts.length, killed: false };
}

/** Manual-mode users still want to pull in replies on demand. */
export async function pollNow(user: User, accountId: string) {
  const account = getAccountById(accountId);
  if (!account || account.user_id !== user.id) throw new Error("Not found");
  db().prepare("UPDATE accounts SET last_poll_at=NULL WHERE id=?").run(accountId);
  return pollReplies(getAccountById(accountId)!, new Date());
}

export { json };
