import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_PATH = ":memory:";
process.env.LLM_MOCK = "1";
process.env.DRY_RUN = "1";

type Mods = {
  db: typeof import("../lib/db");
  store: typeof import("../lib/store");
  engine: typeof import("../lib/engine");
  audit: typeof import("../lib/audit");
  threads: typeof import("../lib/threads");
};
let m: Mods;
let user: import("../lib/store").User;
let accountId: string;

const T0 = new Date("2026-03-10T12:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

beforeAll(async () => {
  m = {
    db: await import("../lib/db"),
    store: await import("../lib/store"),
    engine: await import("../lib/engine"),
    audit: await import("../lib/audit"),
    threads: await import("../lib/threads"),
  };
});
afterAll(() => m.db.resetDbForTests());

beforeEach(() => {
  m.db.resetDbForTests();
  user = m.store.createUser("owner@example.com", "x", true);
  const acc = m.store.upsertAccount(user.id, "999", "demo_account", m.threads.DEMO_TOKEN, new Date(T0.getTime() + 60 * 86400_000));
  accountId = acc.id;
  m.store.saveProfile(accountId, { ...m.store.getProfile(accountId), voice: "plain", niche: "creator tips", allowedDomains: ["example.com"] });
});

const setMode = (mode: string) => m.db.db().prepare("UPDATE accounts SET mode=? WHERE id=?").run(mode, accountId);
const convs = () => m.db.db().prepare("SELECT reply_id, class, status, approved_by, draft_text FROM conversations ORDER BY reply_id").all() as { reply_id: string; class: string; status: string; approved_by: string | null; draft_text: string | null }[];
const account = () => m.store.getAccountById(accountId)!;

describe("reply pipeline", () => {
  it("copilot: drafts everything but sends nothing; injection and spam are skipped", async () => {
    setMode("copilot");
    const n = await m.engine.pollReplies(account(), T0);
    expect(n).toBe(4);
    await m.engine.processNewConversations(user, account(), T0);
    const by = Object.fromEntries(convs().map((c) => [c.reply_id, c]));
    expect(by["demo-reply-1"].status).toBe("pending_approval");
    expect(by["demo-reply-2"].status).toBe("pending_approval");
    expect(by["demo-reply-3"].status).toBe("skipped"); // injection attempt, never reaches the model
    expect(by["demo-reply-3"].draft_text).toBeNull();
    expect(by["demo-reply-4"].status).toBe("pending_approval"); // complaint: human decides
    expect(convs().filter((c) => c.status === "sent" || c.status === "approved")).toHaveLength(0);
  });

  it("polling is idempotent and rate-limited", async () => {
    setMode("copilot");
    await m.engine.pollReplies(account(), T0);
    expect(await m.engine.pollReplies(account(), minutes(1))).toBe(0); // too soon
    expect(await m.engine.pollReplies(account(), minutes(10))).toBe(0); // nothing new, no duplicates
    expect(convs()).toHaveLength(4);
  });

  it("auto: only praise/question are auto-approved, complaints still wait for a human", async () => {
    setMode("auto");
    await m.engine.pollReplies(account(), T0);
    await m.engine.processNewConversations(user, account(), T0);
    const by = Object.fromEntries(convs().map((c) => [c.reply_id, c]));
    expect(by["demo-reply-1"]).toMatchObject({ status: "approved", approved_by: "joe" });
    expect(by["demo-reply-2"]).toMatchObject({ status: "approved", approved_by: "joe" });
    expect(by["demo-reply-4"].status).toBe("pending_approval");
    expect(by["demo-reply-3"].status).toBe("skipped");
  });

  it("auto replies respect send delay, one per tick, and quiet hours", async () => {
    setMode("auto");
    m.db.db().prepare("UPDATE rules SET timezone='UTC', quiet_start='00:00', quiet_end='01:00', reply_delay_min=5, reply_delay_max=5 WHERE account_id=?").run(accountId);
    await m.engine.pollReplies(account(), T0);
    await m.engine.processNewConversations(user, account(), T0);
    // before the delay nothing is sent
    await m.engine.sendDueReplies(account(), minutes(1));
    expect(convs().filter((c) => c.status === "sent")).toHaveLength(0);
    // after the delay: phase 1 creates the container, phase 2 (>=30s later) publishes, one reply per tick
    await m.engine.sendDueReplies(account(), minutes(6));
    expect(convs().filter((c) => c.status === "sent")).toHaveLength(0);
    await m.engine.sendDueReplies(account(), new Date(minutes(6).getTime() + 31_000));
    expect(convs().filter((c) => c.status === "sent")).toHaveLength(1);
  });

  it("daily reply cap blocks auto replies but not human-approved ones", async () => {
    setMode("auto");
    m.db.db().prepare("UPDATE rules SET daily_reply_cap=0, quiet_start='00:00', quiet_end='00:00', reply_delay_min=0, reply_delay_max=0 WHERE account_id=?").run(accountId);
    await m.engine.pollReplies(account(), T0);
    await m.engine.processNewConversations(user, account(), T0);
    await m.engine.sendDueReplies(account(), minutes(1));
    await m.engine.sendDueReplies(account(), minutes(2));
    expect(convs().filter((c) => c.status === "sent")).toHaveLength(0);
    const complaint = m.db.db().prepare("SELECT id FROM conversations WHERE reply_id='demo-reply-4'").get() as { id: string };
    m.engine.userApproveReply(user, accountId, complaint.id, "Sorry about that double charge, we will look into it today.");
    m.db.db().prepare("UPDATE conversations SET send_after=? WHERE id=?").run(minutes(2).toISOString(), complaint.id); // test clock is fixed in the past
    await m.engine.sendDueReplies(account(), minutes(3));
    await m.engine.sendDueReplies(account(), minutes(4));
    expect(convs().find((c) => c.reply_id === "demo-reply-4")?.status).toBe("sent");
  });

  it("manual mode does not draft automatically", async () => {
    setMode("manual");
    await m.engine.tick(T0);
    expect(convs()).toHaveLength(0);
    await m.engine.pollNow(user, accountId);
    expect(convs()).toHaveLength(4);
    expect(convs().every((c) => c.status === "new")).toBe(true);
  });

  it("users cannot touch other users' conversations", async () => {
    await m.engine.pollReplies(account(), T0);
    const other = m.store.createUser("other@example.com", "x", false);
    const c = m.db.db().prepare("SELECT id FROM conversations LIMIT 1").get() as { id: string };
    expect(() => m.engine.userIgnoreReply(other, accountId, c.id)).toThrow();
    expect(() => m.engine.userApproveReply(other, accountId, c.id, "hi")).toThrow();
  });
});

describe("publishing", () => {
  it("user-approved post publishes in two phases and never twice", async () => {
    const id = m.engine.createContent(accountId, "tip", "Batch your drafts on one day and schedule across the week.", { status: "draft", createdBy: "user" });
    m.engine.userApprovePost(user, accountId, id, T0);
    await m.engine.publishDue(account(), T0);
    const row = () => m.db.db().prepare("SELECT status, container_id, threads_media_id, attempts FROM content_items WHERE id=?").get(id) as { status: string; container_id: string | null; threads_media_id: string | null; attempts: number };
    expect(row().status).toBe("publishing");
    expect(row().container_id).toBeTruthy();
    await m.engine.publishDue(account(), minutes(0.2)); // < 30s: still waiting
    expect(row().status).toBe("publishing");
    await m.engine.publishDue(account(), minutes(1));
    expect(row().status).toBe("published");
    const mediaId = row().threads_media_id;
    await m.engine.publishDue(account(), minutes(5));
    expect(row().threads_media_id).toBe(mediaId);
  });

  it("hard safety failures cannot be approved even by the owner", () => {
    const id = m.engine.createContent(accountId, "promo", "Buy at https://evil.test now", { status: "draft", createdBy: "user" });
    expect(() => m.engine.userApprovePost(user, accountId, id, null)).toThrow(/allowlist/);
  });

  it("auto-approved posts obey daily cap, quiet hours and min gap", async () => {
    m.db.db().prepare("UPDATE rules SET timezone='UTC', quiet_start='22:00', quiet_end='06:00', daily_post_cap=1, min_gap_minutes=60 WHERE account_id=?").run(accountId);
    const mk = (t: string) => m.engine.createContent(accountId, "tip", t, { status: "scheduled", createdBy: "joe", approvedBy: "joe", scheduledAt: new Date(T0.getTime() - 1000) });
    const a = mk("First automatic post about consistency and cadence for creators.");
    const b = mk("Second automatic post about writing hooks that earn replies quickly.");
    for (const t of [0, 1, 2, 3]) await m.engine.publishDue(account(), minutes(t));
    const st = (id: string) => (m.db.db().prepare("SELECT status FROM content_items WHERE id=?").get(id) as { status: string }).status;
    expect(st(a)).toBe("published");
    expect(st(b)).toBe("scheduled"); // cap of 1 per 24h reached
    // quiet hours: 23:00 UTC
    const late = new Date("2026-03-10T23:00:00Z");
    m.db.db().prepare("UPDATE rules SET daily_post_cap=10, min_gap_minutes=0 WHERE account_id=?").run(accountId);
    await m.engine.publishDue(account(), late);
    expect(st(b)).toBe("scheduled");
  });
});

describe("controls", () => {
  it("kill switch stops everything", async () => {
    setMode("auto");
    m.audit.setKilled(true);
    const r = await m.engine.tick(T0);
    expect(r.killed).toBe(true);
    expect(convs()).toHaveLength(0);
    m.audit.setKilled(false);
  });

  it("paused or disconnected accounts are skipped", async () => {
    setMode("auto");
    m.db.db().prepare("UPDATE accounts SET status='paused' WHERE id=?").run(accountId);
    await m.engine.tick(T0);
    expect(convs()).toHaveLength(0);
  });

  it("autopilot plans slots into the approval queue in copilot mode", async () => {
    setMode("copilot");
    m.db.db().prepare("UPDATE rules SET autopilot=1, timezone='UTC', post_times='[\"18:00\"]' WHERE account_id=?").run(accountId);
    await m.engine.planPosts(user, account(), T0);
    const rows = m.db.db().prepare("SELECT status, created_by FROM content_items").all() as { status: string; created_by: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "pending_approval" && r.created_by === "joe")).toBe(true);
  });

  it("generation is blocked once the trial lapses when billing is on", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    try {
      m.db.db().prepare("UPDATE users SET trial_ends_at=? WHERE id=?").run(new Date(T0.getTime() - 1000).toISOString(), user.id);
      const fresh = m.store.getUser(user.id)!;
      await expect(m.engine.generateVariantsFor(fresh, account(), "tip", undefined)).rejects.toThrow(/trial has ended/);
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });
});
