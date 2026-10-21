"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACCOUNT_COOKIE } from "../lib/active";
import { audit, setKilled } from "../lib/audit";
import { clearLimit, clientIp, endSession, hitLimit, requireUser, startSession } from "../lib/auth";
import { createCheckoutUrl, createPortalUrl } from "../lib/billing";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { db } from "../lib/db";
import * as engine from "../lib/engine";
import { env } from "../lib/env";
import { isPostKind, type PostKind } from "../lib/joe";
import { isPlanId } from "../lib/plans";
import { parseList } from "../lib/safety";
import { createUser, deleteAccount, effectivePlan, getAccount, getProfile, getRules, getUserByEmail, saveProfile, saveRules, upsertAccount, userCount, type Mode } from "../lib/store";
import { DEMO_TOKEN } from "../lib/threads";
import { isValidTimezone, parseHm, zonedToUtc } from "../lib/time";

type Msg = { ok?: string; error?: string };

function withMsg(path: string, m: Msg): string {
  const u = new URL(path, "http://x");
  if (m.ok) u.searchParams.set("ok", m.ok);
  if (m.error) u.searchParams.set("error", m.error);
  return u.pathname + u.search;
}

/** Run an action, then redirect back with a flash message. redirect() must stay outside try/catch. */
async function run(path: string, fn: () => Promise<string | void> | string | void): Promise<never> {
  const m: Msg = {};
  try {
    const r = await fn();
    if (r) m.ok = r;
  } catch (e) {
    if (e instanceof Error && (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    m.error = e instanceof Error ? e.message : "Something went wrong";
  }
  revalidatePath("/", "layout");
  redirect(withMsg(path, m));
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ------------------------------------------------------------------ auth

const credSchema = z.object({ email: z.string().email().max(200), password: z.string().min(10, "Use at least 10 characters").max(200) });

export async function signupAction(formData: FormData) {
  if (!env.allowSignup && userCount() > 0) redirect(withMsg("/signup", { error: "Sign-ups are closed." }));
  const parsed = credSchema.safeParse({ email: str(formData, "email"), password: String(formData.get("password") ?? "") });
  if (!parsed.success) redirect(withMsg("/signup", { error: parsed.error.issues[0].message }));
  const ip = await clientIp();
  if (hitLimit(`signup:${ip}`, 10, 3600_000)) redirect(withMsg("/signup", { error: "Too many attempts. Try again later." }));
  if (getUserByEmail(parsed.data.email)) redirect(withMsg("/signup", { error: "That email already has an account. Sign in instead." }));
  const user = createUser(parsed.data.email, hashPassword(parsed.data.password), userCount() === 0);
  audit({ userId: user.id, actor: "user", action: "user.signup" });
  await startSession(user);
  redirect("/accounts");
}

export async function loginAction(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();
  if (hitLimit(`login-ip:${ip}`, 30, 15 * 60_000) || hitLimit(`login:${email}`, 8, 15 * 60_000)) {
    redirect(withMsg("/login", { error: "Too many attempts. Wait 15 minutes and try again." }));
  }
  const row = getUserByEmail(email);
  // Verify against a dummy hash when the user is unknown so response time does not reveal which emails exist.
  const ok = row ? verifyPassword(password, row.password_hash) : verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86));
  if (!row || !ok) redirect(withMsg("/login", { error: "Email or password is wrong." }));
  clearLimit(`login:${email}`);
  await startSession({ ...row });
  redirect("/dashboard");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

// ------------------------------------------------------------------ accounts

export async function switchAccountAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "accountId");
  if (getAccount(user.id, id)) (await cookies()).set(ACCOUNT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  revalidatePath("/", "layout");
  redirect(str(formData, "back") || "/dashboard");
}

function ownAccount(userId: string, formData: FormData) {
  const acc = getAccount(userId, str(formData, "accountId"));
  if (!acc) throw new Error("Account not found");
  return acc;
}

export async function disconnectAccountAction(formData: FormData) {
  const user = await requireUser();
  await run("/accounts", () => {
    const acc = ownAccount(user.id, formData);
    deleteAccount(user.id, acc.id);
    audit({ userId: user.id, actor: "user", action: "account.disconnected", detail: { username: acc.username } });
    return `Disconnected @${acc.username} and deleted its stored data and token.`;
  });
}

export async function togglePauseAction(formData: FormData) {
  const user = await requireUser();
  const back = str(formData, "back") || "/joe";
  await run(back, () => {
    const acc = ownAccount(user.id, formData);
    if (acc.status === "needs_reconnect") throw new Error("Reconnect this account first.");
    const next = acc.status === "paused" ? "active" : "paused";
    db().prepare("UPDATE accounts SET status=? WHERE id=?").run(next, acc.id);
    audit({ userId: user.id, accountId: acc.id, actor: "user", action: next === "paused" ? "joe.paused" : "joe.resumed" });
    return next === "paused" ? "Joe is paused. Nothing will be posted or sent." : "Joe is active again.";
  });
}

export async function createDemoAccountAction() {
  const user = await requireUser();
  await run("/accounts", () => {
    if (!env.dryRun) throw new Error("Demo accounts only exist in DRY_RUN mode.");
    const plan = effectivePlan(user);
    if (!plan) throw new Error("Your trial has ended.");
    upsertAccount(user.id, "demo-" + user.id, "demo_account", DEMO_TOKEN, new Date(Date.now() + 60 * 86400_000));
    return "Demo account added. Nothing you do on it reaches Threads.";
  });
}

// ------------------------------------------------------------------ compose / queue

export interface GenerateState {
  variants?: { text: string; angle?: string; blocked: string[]; flags: string[] }[];
  kind?: string;
  error?: string;
}

export async function generateAction(_prev: GenerateState, formData: FormData): Promise<GenerateState> {
  const user = await requireUser();
  try {
    const acc = ownAccount(user.id, formData);
    const kind = str(formData, "kind");
    if (!isPostKind(kind)) throw new Error("Pick a post type");
    const topic = str(formData, "topic").slice(0, 300);
    const variants = await engine.generateVariantsFor(user, acc, kind as PostKind, topic || undefined, 3);
    return { kind, variants: variants.map((v) => ({ text: v.text, angle: v.angle, blocked: v.gate.hardFails, flags: v.gate.flags })) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Generation failed" };
  }
}

function parseWhen(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return zonedToUtc({ y: +m[1], m: +m[2], d: +m[3], h: +m[4], min: +m[5] }, tz);
}

export async function saveContentAction(formData: FormData) {
  const user = await requireUser();
  const intent = str(formData, "intent");
  const dest = intent === "draft" ? "/compose" : "/queue";
  await run(dest, () => {
    const acc = ownAccount(user.id, formData);
    const kind = str(formData, "kind") || "random";
    const text = String(formData.get("text") ?? "").trim();
    if (!text) throw new Error("Write something first.");
    const rules = getRules(acc.id);
    if (intent === "draft") {
      engine.createContent(acc.id, kind, text, { status: "draft", createdBy: "user" });
      return "Saved to drafts.";
    }
    if (intent === "queue") {
      engine.createContent(acc.id, kind, text, { status: "pending_approval", createdBy: "user" });
      return "Added to the approval queue.";
    }
    const id = engine.createContent(acc.id, kind, text, { status: "draft", createdBy: "user" });
    if (intent === "now") {
      engine.userApprovePost(user, acc.id, id, new Date());
      return "Posting now. The worker publishes it within about a minute.";
    }
    const when = parseWhen(str(formData, "scheduleAt"), rules.timezone);
    if (!when) throw new Error("Pick a date and time to schedule.");
    if (when.getTime() < Date.now() - 60_000) throw new Error("That time is in the past.");
    engine.userApprovePost(user, acc.id, id, when);
    return "Scheduled.";
  });
}

export async function postDecisionAction(formData: FormData) {
  const user = await requireUser();
  const back = str(formData, "back") || "/queue";
  await run(back, () => {
    const acc = ownAccount(user.id, formData);
    const id = str(formData, "itemId");
    const intent = str(formData, "intent");
    const text = String(formData.get("text") ?? "").trim();
    if (intent === "reject") {
      engine.userRejectPost(user, acc.id, id);
      return "Rejected.";
    }
    if (intent === "save") {
      engine.userUpdateDraft(user, acc.id, id, text);
      return "Saved.";
    }
    if (intent === "now") {
      engine.userApprovePost(user, acc.id, id, new Date(), text);
      return "Approved. It posts within about a minute.";
    }
    // approve: keep a pre-set slot if it is still in the future, otherwise post now
    const row = db().prepare("SELECT scheduled_at FROM content_items WHERE id=?").get(id) as { scheduled_at: string | null } | undefined;
    const slot = row?.scheduled_at && new Date(row.scheduled_at).getTime() > Date.now() ? new Date(row.scheduled_at) : new Date();
    const custom = str(formData, "scheduleAt");
    const when = custom ? parseWhen(custom, getRules(acc.id).timezone) : slot;
    if (!when) throw new Error("That date is not valid.");
    engine.userApprovePost(user, acc.id, id, when, text);
    return when.getTime() > Date.now() + 60_000 ? "Approved and scheduled." : "Approved. It posts within about a minute.";
  });
}

export async function replyDecisionAction(formData: FormData) {
  const user = await requireUser();
  const back = str(formData, "back") || "/queue?tab=replies";
  await run(back, async () => {
    const acc = ownAccount(user.id, formData);
    const id = str(formData, "convId");
    const intent = str(formData, "intent");
    if (intent === "ignore") {
      engine.userIgnoreReply(user, acc.id, id);
      return "Ignored.";
    }
    if (intent === "hide") {
      await engine.userHideReply(user, acc.id, id);
      return "Hidden on Threads.";
    }
    if (intent === "draft") {
      await engine.userDraftReply(user, acc.id, id);
      return "Draft ready for your review.";
    }
    engine.userApproveReply(user, acc.id, id, String(formData.get("text") ?? ""));
    return "Approved. It sends within about a minute.";
  });
}

export async function fetchRepliesAction(formData: FormData) {
  const user = await requireUser();
  await run(str(formData, "back") || "/replies", async () => {
    const acc = ownAccount(user.id, formData);
    const n = await engine.pollNow(user, acc.id);
    return n ? `Fetched ${n} new repl${n === 1 ? "y" : "ies"}.` : "No new replies.";
  });
}

// ------------------------------------------------------------------ Joe settings

export async function saveModeAction(formData: FormData) {
  const user = await requireUser();
  await run("/joe", () => {
    const acc = ownAccount(user.id, formData);
    const mode = str(formData, "mode") as Mode;
    if (!["manual", "copilot", "auto"].includes(mode)) throw new Error("Unknown mode");
    if (mode === "auto") {
      const plan = effectivePlan(user);
      if (!plan?.autoMode) throw new Error("Auto mode is not included in your current plan.");
      if (acc.mode !== "auto" && formData.get("confirm") !== "yes") throw new Error("Tick the box to confirm you understand Joe will post and reply without asking.");
    }
    db().prepare("UPDATE accounts SET mode=? WHERE id=?").run(mode, acc.id);
    audit({ userId: user.id, accountId: acc.id, actor: "user", action: "mode.changed", detail: { from: acc.mode, to: mode } });
    return `Joe is now in ${mode} mode.`;
  });
}

const profileSchema = z.object({
  voice: z.string().max(800),
  niche: z.string().max(300),
  audience: z.string().max(300),
  offer: z.string().max(1000),
  language: z.string().min(2).max(40),
  emojiPolicy: z.enum(["none", "sparingly", "freely"]),
  disclosureText: z.string().max(60),
});

export async function saveProfileAction(formData: FormData) {
  const user = await requireUser();
  await run("/joe", () => {
    const acc = ownAccount(user.id, formData);
    const p = profileSchema.parse({
      voice: str(formData, "voice"),
      niche: str(formData, "niche"),
      audience: str(formData, "audience"),
      offer: str(formData, "offer"),
      language: str(formData, "language") || "English",
      emojiPolicy: str(formData, "emojiPolicy") || "sparingly",
      disclosureText: str(formData, "disclosureText") || "(AI-assisted)",
    });
    const samples = String(formData.get("samplePosts") ?? "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 500));
    saveProfile(acc.id, {
      ...getProfile(acc.id),
      ...p,
      bannedTerms: parseList(str(formData, "bannedTerms")).slice(0, 50),
      allowedDomains: parseList(str(formData, "allowedDomains")).map((d) => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()).slice(0, 20),
      samplePosts: samples,
      disclosureEnabled: formData.get("disclosureEnabled") === "on",
    });
    audit({ userId: user.id, accountId: acc.id, actor: "user", action: "profile.saved" });
    return "Brand profile saved.";
  });
}

const KINDS = ["hook", "story", "tip", "promo", "marketing", "question", "random"];
const CLASSES = ["praise", "question", "other"]; // the only classes that may ever be auto-answered

export async function saveRulesAction(formData: FormData) {
  const user = await requireUser();
  await run("/joe", () => {
    const acc = ownAccount(user.id, formData);
    const tz = str(formData, "timezone");
    if (!isValidTimezone(tz)) throw new Error("Unknown time zone. Use a name like Europe/London.");
    const times = parseList(str(formData, "postTimes")).slice(0, 12);
    if (times.some((t) => !parseHm(t))) throw new Error("Posting times must look like 09:00, one per line or comma separated.");
    for (const k of ["quietStart", "quietEnd"]) if (!parseHm(str(formData, k))) throw new Error("Quiet hours must look like 23:00.");
    const num = (k: string, lo: number, hi: number) => {
      const n = Number(str(formData, k));
      if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
      return Math.round(n);
    };
    const delayMin = num("replyDelayMin", 0, 120);
    const delayMax = num("replyDelayMax", 0, 240);
    if (delayMax < delayMin) throw new Error("Maximum reply delay must be at least the minimum.");
    saveRules(acc.id, {
      autopilot: formData.get("autopilot") === "on",
      postTimes: times,
      timezone: tz,
      postKinds: formData.getAll("postKinds").map(String).filter((k) => KINDS.includes(k)),
      dailyPostCap: num("dailyPostCap", 0, 20),
      dailyReplyCap: num("dailyReplyCap", 0, 200),
      quietStart: str(formData, "quietStart"),
      quietEnd: str(formData, "quietEnd"),
      minGapMinutes: num("minGapMinutes", 0, 1440),
      replyDelayMin: delayMin,
      replyDelayMax: delayMax,
      autoReplyClasses: formData.getAll("autoReplyClasses").map(String).filter((c) => CLASSES.includes(c)),
    });
    audit({ userId: user.id, accountId: acc.id, actor: "user", action: "rules.saved" });
    return "Rules saved.";
  });
}

export async function killSwitchAction(formData: FormData) {
  const user = await requireUser();
  await run("/joe", () => {
    if (!user.is_admin) throw new Error("Only the operator can use the global kill switch.");
    const on = str(formData, "on") === "1";
    setKilled(on);
    audit({ userId: user.id, actor: "user", action: on ? "kill_switch.on" : "kill_switch.off" });
    return on ? "Kill switch ON. Joe is stopped for every account." : "Kill switch off.";
  });
}

// ------------------------------------------------------------------ billing

export async function checkoutAction(formData: FormData) {
  const user = await requireUser();
  const plan = str(formData, "plan");
  let url = "";
  try {
    if (!isPlanId(plan) || plan === "trial") throw new Error("Unknown plan");
    url = await createCheckoutUrl(user, plan);
  } catch (e) {
    redirect(withMsg("/billing", { error: e instanceof Error ? e.message : "Checkout failed" }));
  }
  redirect(url);
}

export async function portalAction() {
  const user = await requireUser();
  let url = "";
  try {
    url = await createPortalUrl(user);
  } catch (e) {
    redirect(withMsg("/billing", { error: e instanceof Error ? e.message : "Could not open billing portal" }));
  }
  redirect(url);
}
