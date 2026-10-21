import Link from "next/link";
import { activeAccount } from "../../../lib/active";
import { requireUser } from "../../../lib/auth";
import { db, json } from "../../../lib/db";
import { env } from "../../../lib/env";
import { effectivePlan, getRules, monthlyUsage, pendingCounts } from "../../../lib/store";
import { togglePauseAction } from "../../actions";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { Empty, fmt, ModeBadge, PageHead, StatusBadge } from "../../components/ui";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const MODE_COPY: Record<string, string> = {
  manual: "Joe only writes when you ask. Nothing is queued or sent for you.",
  copilot: "Joe drafts posts and replies into your approval queue. Nothing goes out until you approve it.",
  auto: "Joe posts and replies on his own inside your caps. Anything risky still waits for you.",
};

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { ok, error } = await flashFrom(searchParams);
  const { account } = await activeAccount(user);
  const plan = effectivePlan(user);
  const pending = pendingCounts(user.id);
  const usage = monthlyUsage(user.id);

  if (!account) {
    return (
      <>
        <PageHead title="Welcome to ThreadsByJoe" sub="Three steps and Joe is working for you." />
        <Flash ok={ok} error={error} />
        <div className="card list">
          {[
            ["1", "Connect your Threads account", "You sign in on Threads itself. ThreadsByJoe never sees your password.", "/accounts", "Connect"],
            ["2", "Teach Joe your voice", "Add your niche, audience, offer and a few posts you like. Everything Joe writes starts from this.", "/joe", "Open Joe settings"],
            ["3", "Review the first drafts", "Joe starts in Copilot mode: every post and reply waits for your approval.", "/queue", "Open the queue"],
          ].map(([n, t, d, href, cta]) => (
            <div className="item" key={n}>
              <div className="spread">
                <div className="row">
                  <span className="label">Step {n}</span>
                  <h3>{t}</h3>
                </div>
                <Link className="btn btn-sm" href={href}>{cta}</Link>
              </div>
              <p className="muted small">{d}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  const rules = getRules(account.id);
  const d7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const published7 = (db().prepare("SELECT COUNT(*) c FROM content_items WHERE account_id=? AND published_at>=?").get(account.id, d7) as { c: number }).c;
  const replies7 = (db().prepare("SELECT COUNT(*) c FROM conversations WHERE account_id=? AND sent_at>=?").get(account.id, d7) as { c: number }).c;
  const upcoming = db()
    .prepare("SELECT id, kind, text, status, scheduled_at FROM content_items WHERE account_id=? AND status IN ('scheduled','pending_approval','publishing') ORDER BY COALESCE(scheduled_at,'9999') LIMIT 5")
    .all(account.id) as { id: string; kind: string; text: string; status: string; scheduled_at: string | null }[];
  const recent = db()
    .prepare("SELECT actor, action, detail, created_at FROM audit_log WHERE account_id=? ORDER BY id DESC LIMIT 6")
    .all(account.id) as { actor: string; action: string; detail: string; created_at: string }[];

  const meter = (used: number, limit: number) => (
    <div className={`meter ${used / limit > 0.85 ? "hot" : ""}`}><i style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>
  );

  return (
    <>
      <PageHead title="Overview" sub={`@${account.username}`}>
        <Link className="btn btn-primary" href="/compose">Write a post</Link>
      </PageHead>
      <Flash ok={ok} error={error} />

      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <Link href="/queue" className="card stat" style={{ textDecoration: "none" }}>
          <div className="label">Needs you</div>
          <div className="num">{pending.posts + pending.replies}</div>
          <div className="sub">{pending.posts} posts, {pending.replies} replies</div>
        </Link>
        <div className="card stat">
          <div className="label">Published, 7 days</div>
          <div className="num">{published7}</div>
          <div className="sub">posts</div>
        </div>
        <div className="card stat">
          <div className="label">Replies sent, 7 days</div>
          <div className="num">{replies7}</div>
          <div className="sub">to your commenters</div>
        </div>
        <div className="card stat">
          <div className="label">Next up</div>
          <div className="num" style={{ fontSize: 18, marginTop: 10 }}>{upcoming.find((u) => u.scheduled_at)?.scheduled_at ? fmt(upcoming.find((u) => u.scheduled_at)!.scheduled_at, rules.timezone) : "Nothing scheduled"}</div>
          <div className="sub">{rules.timezone}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card card-pad stack">
          <div className="spread">
            <h2>Joe</h2>
            <ModeBadge mode={account.mode} />
          </div>
          <p className="muted">{MODE_COPY[account.mode]}</p>
          <div className="row-wrap">
            <StatusBadge status={account.status} />
            {account.mode !== "manual" && <span className="badge">{rules.autopilot ? "Autopilot on" : "Autopilot off"}</span>}
            {account.mode === "auto" && <span className="badge">{rules.dailyPostCap} posts and {rules.dailyReplyCap} replies a day max</span>}
          </div>
          <div className="row-wrap">
            <Link className="btn btn-sm" href="/joe">Change mode and rules</Link>
            {account.status !== "needs_reconnect" && (
              <form action={togglePauseAction}>
                <input type="hidden" name="accountId" value={account.id} />
                <input type="hidden" name="back" value="/dashboard" />
                <button className="btn btn-sm" type="submit">{account.status === "paused" ? "Resume Joe" : "Pause Joe"}</button>
              </form>
            )}
          </div>
        </section>

        <section className="card card-pad stack">
          <div className="spread">
            <h2>This month</h2>
            <span className="badge">{plan ? plan.name : "No plan"}</span>
          </div>
          {plan ? (
            <>
              <div className="stack-sm">
                <div className="spread small"><span>Post generations</span><span className="mono">{usage.generations} / {plan.generationsPerMonth}</span></div>
                {meter(usage.generations, plan.generationsPerMonth)}
              </div>
              <div className="stack-sm">
                <div className="spread small"><span>Reply drafts</span><span className="mono">{usage.replyDrafts} / {plan.replyDraftsPerMonth}</span></div>
                {meter(usage.replyDrafts, plan.replyDraftsPerMonth)}
              </div>
              {user.is_admin && <p className="small muted">Estimated AI cost this month: ${usage.costUsd.toFixed(3)} (all your accounts).</p>}
            </>
          ) : (
            <p className="muted">Your trial has ended. <Link href="/billing">Choose a plan</Link>.</p>
          )}
        </section>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="card-head"><h2>Coming up</h2><Link className="btn btn-sm btn-ghost" href="/calendar">Calendar</Link></div>
          {upcoming.length === 0 ? (
            <Empty title="Nothing queued">Write a post, or turn on Autopilot in Joe settings.</Empty>
          ) : (
            <div className="list">
              {upcoming.map((u) => (
                <div className="item" key={u.id}>
                  <div className="spread"><StatusBadge status={u.status} /><span className="small muted">{u.scheduled_at ? fmt(u.scheduled_at, rules.timezone) : "No time set"}</span></div>
                  <p className="post-text small">{u.text.length > 140 ? u.text.slice(0, 140) + "…" : u.text}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>Recent activity</h2><Link className="btn btn-sm btn-ghost" href="/activity">All</Link></div>
          {recent.length === 0 ? (
            <Empty title="No activity yet" />
          ) : (
            <div className="list">
              {recent.map((r, i) => (
                <div className="item" key={i} style={{ padding: "11px 18px" }}>
                  <div className="spread small"><span><b>{r.actor === "joe" ? "Joe" : r.actor === "user" ? "You" : "System"}</b> {r.action.replace(/[._]/g, " ")}</span><span className="muted">{fmt(r.created_at, rules.timezone)}</span></div>
                  {Object.keys(json<Record<string, unknown>>(r.detail, {})).length > 0 && null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {env.dryRun && <p className="small muted" style={{ marginTop: 16 }}>Dry run is on, so published items above were simulated.</p>}
    </>
  );
}
