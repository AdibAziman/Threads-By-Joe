import Link from "next/link";
import { requireActiveAccount } from "../../../lib/active";
import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { getRules } from "../../../lib/store";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { PostCard, type PostRow } from "../../components/PostCard";
import { ReplyCard, type ConvRow } from "../../components/ReplyCard";
import { Empty, PageHead } from "../../components/ui";

export const metadata = { title: "Approval queue" };
export const dynamic = "force-dynamic";

export default async function Queue({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { account } = await requireActiveAccount(user);
  const { ok, error, q } = await flashFrom(searchParams);
  const tab = q.tab === "replies" ? "replies" : "posts";
  const rules = getRules(account.id);
  const posts = db().prepare("SELECT * FROM content_items WHERE account_id=? AND status IN ('pending_approval','failed') ORDER BY COALESCE(scheduled_at, created_at)").all(account.id) as PostRow[];
  const replies = db().prepare("SELECT * FROM conversations WHERE account_id=? AND status IN ('pending_approval','failed') ORDER BY created_at").all(account.id) as ConvRow[];

  return (
    <>
      <PageHead title="Approval queue" sub="Everything Joe wants to send, waiting for your yes. Edit anything before approving." />
      <Flash ok={ok} error={error} />
      <div className="tabs" role="navigation" aria-label="Queue sections">
        <Link href="/queue" aria-current={tab === "posts" ? "page" : undefined}>Posts ({posts.length})</Link>
        <Link href="/queue?tab=replies" aria-current={tab === "replies" ? "page" : undefined}>Replies ({replies.length})</Link>
      </div>
      <div className="card">
        {tab === "posts" ? (
          posts.length === 0 ? (
            <Empty title="No posts waiting">Ask Joe for a post on the Compose page, or turn on Autopilot in Joe settings.</Empty>
          ) : (
            <div className="list">{posts.map((p) => <PostCard key={p.id} post={p} tz={rules.timezone} back="/queue" />)}</div>
          )
        ) : replies.length === 0 ? (
          <Empty title="No replies waiting">New comments show up here after Joe reads and drafts them.</Empty>
        ) : (
          <div className="list">{replies.map((c) => <ReplyCard key={c.id} c={c} tz={rules.timezone} back="/queue?tab=replies" />)}</div>
        )}
      </div>
    </>
  );
}
