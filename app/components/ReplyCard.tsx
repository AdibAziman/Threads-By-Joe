import { json } from "../../lib/db";
import { replyDecisionAction } from "../actions";
import { CountedTextArea } from "./TextArea";
import { fmt, StatusBadge } from "./ui";

export interface ConvRow {
  id: string;
  account_id: string;
  username: string;
  text: string;
  post_text: string;
  class: string | null;
  risk: number | null;
  reason: string | null;
  status: string;
  draft_text: string | null;
  draft_flags: string;
  last_error: string | null;
  reply_ts: string | null;
  approved_by: string | null;
  send_after: string | null;
}

export function ReplyCard({ c, tz, back }: { c: ConvRow; tz: string; back: string }) {
  const flags = json<string[]>(c.draft_flags, []);
  const editable = ["pending_approval", "new", "skipped", "failed"].includes(c.status);
  return (
    <form action={replyDecisionAction} className="item">
      <input type="hidden" name="accountId" value={c.account_id} />
      <input type="hidden" name="convId" value={c.id} />
      <input type="hidden" name="back" value={back} />
      <div className="spread">
        <div className="row-wrap">
          <StatusBadge status={c.status} />
          {c.class && <span className="badge">{c.class}</span>}
          {c.risk !== null && c.risk >= 0.4 && <span className="badge warn">risk {Math.round(c.risk * 100)}%</span>}
          <span className="small muted">@{c.username}{c.reply_ts ? `, ${fmt(c.reply_ts, tz)}` : ""}</span>
        </div>
      </div>
      <div className="stack-sm">
        <div className="label">Your post</div>
        <p className="small muted">{c.post_text.length > 160 ? c.post_text.slice(0, 160) + "…" : c.post_text}</p>
        <div className="label">Their comment</div>
        <div className="quote">{c.text}</div>
        {c.reason && <p className="small muted">Joe's read: {c.reason}</p>}
      </div>
      {editable || c.draft_text ? (
        <>
          <div className="label">Reply</div>
          {editable ? <CountedTextArea id={`reply-${c.id}`} name="text" defaultValue={c.draft_text ?? ""} rows={3} max={500} /> : <div className="quote post-text">{c.draft_text}</div>}
        </>
      ) : null}
      {flags.length > 0 && <div className="chips">{flags.map((f) => <span key={f} className={`badge ${f.startsWith("blocked") ? "bad" : "warn"}`}>{f}</span>)}</div>}
      {c.last_error && <div className="banner bad small">{c.last_error}</div>}
      {c.status === "approved" && <p className="small muted">{c.approved_by === "joe" ? "Joe approved this" : "You approved this"}{c.send_after ? `. Sends after ${fmt(c.send_after, tz)}.` : "."}</p>}
      {editable && (
        <div className="row-wrap">
          {c.draft_text ? <button className="btn btn-primary btn-sm" name="intent" value="approve">Approve and send</button> : <button className="btn btn-primary btn-sm" name="intent" value="draft">Draft with Joe</button>}
          {c.draft_text && <button className="btn btn-sm" name="intent" value="draft">Redraft</button>}
          <button className="btn btn-sm" name="intent" value="hide" title="Hides the comment on Threads (it is not deleted)">Hide on Threads</button>
          <button className="btn btn-sm btn-ghost" name="intent" value="ignore">Ignore</button>
        </div>
      )}
    </form>
  );
}

