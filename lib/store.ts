import { db, json, nowIso } from "./db";
import { decrypt, encrypt, randomId } from "./crypto";
import { env } from "./env";
import { PLANS, TRIAL_DAYS, type Plan } from "./plans";

export type Mode = "manual" | "copilot" | "auto";

export interface User {
  id: string;
  email: string;
  plan: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  is_admin: number;
  session_version: number;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  threads_user_id: string;
  username: string;
  token_enc: string;
  token_expires_at: string | null;
  mode: Mode;
  status: "active" | "paused" | "needs_reconnect";
  last_poll_at: string | null;
  last_refresh_at: string | null;
  last_plan_at: string | null;
  created_at: string;
}

export interface Profile {
  voice: string;
  niche: string;
  audience: string;
  offer: string;
  language: string;
  emojiPolicy: string;
  bannedTerms: string[];
  allowedDomains: string[];
  samplePosts: string[];
  disclosureEnabled: boolean;
  disclosureText: string;
}

export interface Rules {
  autopilot: boolean;
  postTimes: string[];
  timezone: string;
  postKinds: string[];
  dailyPostCap: number;
  dailyReplyCap: number;
  quietStart: string;
  quietEnd: string;
  minGapMinutes: number;
  replyDelayMin: number;
  replyDelayMax: number;
  autoReplyClasses: string[];
}

export function createUser(email: string, passwordHash: string, isAdmin: boolean): User {
  const id = randomId(12);
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400_000).toISOString();
  db()
    .prepare("INSERT INTO users (id,email,password_hash,plan,trial_ends_at,is_admin,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, email.toLowerCase(), passwordHash, "trial", trialEnds, isAdmin ? 1 : 0, nowIso());
  return getUser(id)!;
}

export function getUser(id: string): User | undefined {
  return db().prepare("SELECT id,email,plan,trial_ends_at,stripe_customer_id,stripe_subscription_id,subscription_status,is_admin,session_version,created_at FROM users WHERE id=?").get(id) as User | undefined;
}

export function getUserByEmail(email: string): (User & { password_hash: string }) | undefined {
  return db().prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase()) as (User & { password_hash: string }) | undefined;
}

export function userCount(): number {
  return (db().prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c;
}

/** The plan whose limits apply right now, or null when the trial lapsed and there is no active subscription. */
export function effectivePlan(user: User): Plan | null {
  if (!env.billingEnabled) return PLANS.pro; // self-hosted / dev: no billing, Pro limits
  if (user.plan !== "trial") {
    const ok = !user.subscription_status || ["active", "trialing", "past_due"].includes(user.subscription_status);
    return ok ? PLANS[user.plan as keyof typeof PLANS] ?? null : null;
  }
  if (user.trial_ends_at && new Date(user.trial_ends_at).getTime() > Date.now()) return PLANS.trial;
  return null;
}

export function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export function monthlyUsage(userId: string): { generations: number; replyDrafts: number; costUsd: number } {
  const rows = db()
    .prepare("SELECT purpose, COUNT(*) c, COALESCE(SUM(cost_usd),0) cost FROM llm_calls WHERE user_id=? AND ok=1 AND created_at>=? GROUP BY purpose")
    .all(userId, monthStartIso()) as { purpose: string; c: number; cost: number }[];
  const by = Object.fromEntries(rows.map((r) => [r.purpose, r]));
  return { generations: by.generate?.c ?? 0, replyDrafts: by.reply?.c ?? 0, costUsd: rows.reduce((a, r) => a + r.cost, 0) };
}

export class PlanLimitError extends Error {}

export function assertCanGenerate(user: User, purpose: "generate" | "reply") {
  const plan = effectivePlan(user);
  if (!plan) throw new PlanLimitError("Your trial has ended. Choose a plan on the Billing page to keep using Joe.");
  const u = monthlyUsage(user.id);
  if (purpose === "generate" && u.generations >= plan.generationsPerMonth) throw new PlanLimitError(`Monthly generation limit reached (${plan.generationsPerMonth}) on the ${plan.name} plan.`);
  if (purpose === "reply" && u.replyDrafts >= plan.replyDraftsPerMonth) throw new PlanLimitError(`Monthly reply-draft limit reached (${plan.replyDraftsPerMonth}) on the ${plan.name} plan.`);
}

export function listAccounts(userId: string): Account[] {
  return db().prepare("SELECT * FROM accounts WHERE user_id=? ORDER BY created_at").all(userId) as Account[];
}

export function getAccount(userId: string, accountId: string): Account | undefined {
  return db().prepare("SELECT * FROM accounts WHERE id=? AND user_id=?").get(accountId, userId) as Account | undefined;
}

export function getAccountById(accountId: string): Account | undefined {
  return db().prepare("SELECT * FROM accounts WHERE id=?").get(accountId) as Account | undefined;
}

export function upsertAccount(userId: string, threadsUserId: string, username: string, token: string, expiresAt: Date | null): Account {
  const existing = db().prepare("SELECT id FROM accounts WHERE user_id=? AND threads_user_id=?").get(userId, threadsUserId) as { id: string } | undefined;
  if (existing) {
    db().prepare("UPDATE accounts SET username=?, token_enc=?, token_expires_at=?, status='active', last_refresh_at=? WHERE id=?").run(username, encrypt(token), expiresAt?.toISOString() ?? null, nowIso(), existing.id);
    return getAccountById(existing.id)!;
  }
  const id = randomId(12);
  db().transaction(() => {
    db().prepare("INSERT INTO accounts (id,user_id,threads_user_id,username,token_enc,token_expires_at,mode,status,last_refresh_at,created_at) VALUES (?,?,?,?,?,?, 'copilot','active',?,?)").run(id, userId, threadsUserId, username, encrypt(token), expiresAt?.toISOString() ?? null, nowIso(), nowIso());
    db().prepare("INSERT INTO brand_profiles (account_id) VALUES (?)").run(id);
    db().prepare("INSERT INTO rules (account_id) VALUES (?)").run(id);
  })();
  return getAccountById(id)!;
}

export function accountToken(account: Account): string {
  return decrypt(account.token_enc);
}

export function setAccountToken(accountId: string, token: string, expiresAt: Date) {
  db().prepare("UPDATE accounts SET token_enc=?, token_expires_at=?, last_refresh_at=? WHERE id=?").run(encrypt(token), expiresAt.toISOString(), nowIso(), accountId);
}

export function deleteAccount(userId: string, accountId: string) {
  db().prepare("DELETE FROM accounts WHERE id=? AND user_id=?").run(accountId, userId);
}

export function getProfile(accountId: string): Profile {
  const r = db().prepare("SELECT * FROM brand_profiles WHERE account_id=?").get(accountId) as Record<string, string | number>;
  return {
    voice: String(r.voice ?? ""),
    niche: String(r.niche ?? ""),
    audience: String(r.audience ?? ""),
    offer: String(r.offer ?? ""),
    language: String(r.language ?? "English"),
    emojiPolicy: String(r.emoji_policy ?? "sparingly"),
    bannedTerms: json<string[]>(r.banned_terms as string, []),
    allowedDomains: json<string[]>(r.allowed_domains as string, []),
    samplePosts: json<string[]>(r.sample_posts as string, []),
    disclosureEnabled: Boolean(r.disclosure_enabled),
    disclosureText: String(r.disclosure_text ?? ""),
  };
}

export function saveProfile(accountId: string, p: Profile) {
  db()
    .prepare(
      `UPDATE brand_profiles SET voice=?, niche=?, audience=?, offer=?, language=?, emoji_policy=?, banned_terms=?, allowed_domains=?, sample_posts=?, disclosure_enabled=?, disclosure_text=? WHERE account_id=?`,
    )
    .run(p.voice, p.niche, p.audience, p.offer, p.language, p.emojiPolicy, JSON.stringify(p.bannedTerms), JSON.stringify(p.allowedDomains), JSON.stringify(p.samplePosts), p.disclosureEnabled ? 1 : 0, p.disclosureText, accountId);
}

export function getRules(accountId: string): Rules {
  const r = db().prepare("SELECT * FROM rules WHERE account_id=?").get(accountId) as Record<string, string | number>;
  return {
    autopilot: Boolean(r.autopilot),
    postTimes: json<string[]>(r.post_times as string, []),
    timezone: String(r.timezone),
    postKinds: json<string[]>(r.post_kinds as string, []),
    dailyPostCap: Number(r.daily_post_cap),
    dailyReplyCap: Number(r.daily_reply_cap),
    quietStart: String(r.quiet_start),
    quietEnd: String(r.quiet_end),
    minGapMinutes: Number(r.min_gap_minutes),
    replyDelayMin: Number(r.reply_delay_min),
    replyDelayMax: Number(r.reply_delay_max),
    autoReplyClasses: json<string[]>(r.auto_reply_classes as string, []),
  };
}

export function saveRules(accountId: string, r: Rules) {
  db()
    .prepare(
      `UPDATE rules SET autopilot=?, post_times=?, timezone=?, post_kinds=?, daily_post_cap=?, daily_reply_cap=?, quiet_start=?, quiet_end=?, min_gap_minutes=?, reply_delay_min=?, reply_delay_max=?, auto_reply_classes=? WHERE account_id=?`,
    )
    .run(r.autopilot ? 1 : 0, JSON.stringify(r.postTimes), r.timezone, JSON.stringify(r.postKinds), r.dailyPostCap, r.dailyReplyCap, r.quietStart, r.quietEnd, r.minGapMinutes, r.replyDelayMin, r.replyDelayMax, JSON.stringify(r.autoReplyClasses), accountId);
}

export function recentPostTexts(accountId: string, n = 30): string[] {
  const rows = db()
    .prepare("SELECT text FROM content_items WHERE account_id=? AND status IN ('published','scheduled','pending_approval','publishing') ORDER BY created_at DESC LIMIT ?")
    .all(accountId, n) as { text: string }[];
  return rows.map((r) => r.text);
}

export function recentReplyTexts(accountId: string, n = 30): string[] {
  const rows = db()
    .prepare("SELECT draft_text FROM conversations WHERE account_id=? AND draft_text IS NOT NULL AND status IN ('sent','approved','pending_approval') ORDER BY updated_at DESC LIMIT ?")
    .all(accountId, n) as { draft_text: string }[];
  return rows.map((r) => r.draft_text);
}

const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export function publishedPostsLast24h(accountId: string): number {
  return (db().prepare("SELECT COUNT(*) c FROM content_items WHERE account_id=? AND published_at>=?").get(accountId, hoursAgoIso(24)) as { c: number }).c;
}

export function sentRepliesLast24h(accountId: string): number {
  return (db().prepare("SELECT COUNT(*) c FROM conversations WHERE account_id=? AND sent_at>=?").get(accountId, hoursAgoIso(24)) as { c: number }).c;
}

export function lastPublishedAt(accountId: string): string | null {
  const r = db().prepare("SELECT MAX(published_at) m FROM content_items WHERE account_id=?").get(accountId) as { m: string | null };
  return r.m;
}

export function pendingCounts(userId: string): { posts: number; replies: number } {
  const posts = db().prepare("SELECT COUNT(*) c FROM content_items ci JOIN accounts a ON a.id=ci.account_id WHERE a.user_id=? AND ci.status='pending_approval'").get(userId) as { c: number };
  const replies = db().prepare("SELECT COUNT(*) c FROM conversations cv JOIN accounts a ON a.id=cv.account_id WHERE a.user_id=? AND cv.status='pending_approval'").get(userId) as { c: number };
  return { posts: posts.c, replies: replies.c };
}
