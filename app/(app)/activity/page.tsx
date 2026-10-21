import { requireUser } from "../../../lib/auth";
import { db, json } from "../../../lib/db";
import { listAccounts } from "../../../lib/store";
import { Empty, fmt, PageHead } from "../../components/ui";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "post.published": "published a post",
  "post.auto_scheduled": "scheduled a post by himself",
  "post.queued_for_approval": "queued a post for approval",
  "post.approved": "approved a post",
  "post.rejected": "rejected a post",
  "post.failed": "could not publish a post",
  "post.generation_blocked": "dropped drafts that failed safety checks",
  "post.generation_error": "hit an error while writing",
  "reply.sent": "sent a reply",
  "reply.auto_approved": "approved a reply by himself",
  "reply.approved": "approved a reply",
  "reply.ignored": "ignored a comment",
  "reply.hidden": "hid a comment on Threads",
  "reply.skipped_injection": "skipped a comment that tried to give instructions",
  "replies.fetched": "fetched new comments",
  "mode.changed": "changed the mode",
  "joe.paused": "paused Joe",
  "joe.resumed": "resumed Joe",
  "profile.saved": "saved the brand profile",
  "rules.saved": "saved the rules",
  "account.connected": "connected an account",
  "account.reconnected": "reconnected an account",
  "account.needs_reconnect": "lost access, reconnect needed",
  "account.deauthorized": "was disconnected from Threads' side",
  "token.refreshed": "renewed the Threads access token",
  "plan.limit": "stopped at a plan limit",
};

export default async function Activity() {
  const user = await requireUser();
  const names = Object.fromEntries(listAccounts(user.id).map((a) => [a.id, a.username]));
  const rows = db()
    .prepare("SELECT id, account_id, actor, action, detail, created_at FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 150")
    .all(user.id) as { id: number; account_id: string | null; actor: string; action: string; detail: string; created_at: string }[];

  return (
    <>
      <PageHead title="Activity" sub="Every action, who took it, and when. Nothing Joe does is hidden." />
      <div className="card">
        {rows.length === 0 ? (
          <Empty title="Nothing yet" />
        ) : (
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Account</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const d = json<Record<string, unknown>>(r.detail, {});
                const extra = [d.kind, d.class, d.count, d.to, d.error, d.message].filter(Boolean).join(" · ");
                return (
                  <tr key={r.id}>
                    <td className="small muted" style={{ whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                    <td><span className={`badge ${r.actor === "joe" ? "ok" : ""}`}>{r.actor === "joe" ? "Joe" : r.actor === "user" ? "You" : "System"}</span></td>
                    <td>{ACTION_LABEL[r.action] ?? r.action.replace(/[._]/g, " ")}{extra && <span className="small muted"> ({String(extra).slice(0, 140)})</span>}</td>
                    <td className="small muted">{r.account_id ? `@${names[r.account_id] ?? "removed"}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
