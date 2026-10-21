import { fmt, StatusBadge } from "./ui";
import { CountedTextArea } from "./TextArea";
import { postDecisionAction } from "../actions";
import { KIND_LABEL, type PostKind } from "../../lib/joe";

export interface PostRow {
  id: string;
  account_id: string;
  kind: string;
  text: string;
  status: string;
  scheduled_at: string | null;
  created_by: string;
  risk_flags: string;
  last_error: string | null;
  permalink: string | null;
  published_at: string | null;
}

/** Editable card for a draft or a post waiting for approval. */
export function PostCard({ post, tz, back }: { post: PostRow; tz: string; back: string }) {
  const flags: string[] = (() => {
    try {
      return JSON.parse(post.risk_flags);
    } catch {
      return [];
    }
  })();
  const fid = `post-${post.id}`;
  return (
    <form action={postDecisionAction} className="item">
      <input type="hidden" name="accountId" value={post.account_id} />
      <input type="hidden" name="itemId" value={post.id} />
      <input type="hidden" name="back" value={back} />
      <div className="spread">
        <div className="row-wrap">
          <StatusBadge status={post.status} />
          <span className="badge">{KIND_LABEL[post.kind as PostKind] ?? post.kind}</span>
          <span className="small muted">{post.created_by === "joe" ? "Written by Joe" : "Written by you"}</span>
        </div>
        {post.scheduled_at && <span className="small muted">Slot: {fmt(post.scheduled_at, tz)}</span>}
      </div>
      <CountedTextArea id={fid} name="text" defaultValue={post.text} rows={4} />
      {flags.length > 0 && <div className="chips">{flags.map((f) => <span key={f} className="badge warn">{f}</span>)}</div>}
      {post.last_error && <div className="banner bad small">{post.last_error}</div>}
      <div className="row-wrap">
        <button className="btn btn-primary btn-sm" name="intent" value="approve">{post.scheduled_at ? "Approve for slot" : "Approve"}</button>
        <button className="btn btn-sm" name="intent" value="now">Post now</button>
        <button className="btn btn-sm" name="intent" value="save">Save edits</button>
        <label className="row small" style={{ marginLeft: "auto" }}>
          <span className="muted">Or schedule</span>
          <input type="datetime-local" name="scheduleAt" style={{ width: "auto" }} />
        </label>
        <button className="btn btn-sm btn-danger" name="intent" value="reject">Reject</button>
      </div>
    </form>
  );
}
