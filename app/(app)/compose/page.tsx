import { requireActiveAccount } from "../../../lib/active";
import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { getRules } from "../../../lib/store";
import { ComposeClient } from "../../components/ComposeClient";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { PostCard, type PostRow } from "../../components/PostCard";
import { Empty, PageHead } from "../../components/ui";

export const metadata = { title: "Compose" };
export const dynamic = "force-dynamic";

export default async function Compose({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { account } = await requireActiveAccount(user);
  const { ok, error } = await flashFrom(searchParams);
  const rules = getRules(account.id);
  const drafts = db().prepare("SELECT * FROM content_items WHERE account_id=? AND status='draft' ORDER BY created_at DESC LIMIT 20").all(account.id) as PostRow[];

  return (
    <>
      <PageHead title="Compose" sub={`Posting as @${account.username}. Schedules use ${rules.timezone}.`} />
      <Flash ok={ok} error={error} />
      <div className="stack">
        <ComposeClient accountId={account.id} />
        <section className="card">
          <div className="card-head"><h2>Drafts</h2><span className="small muted">{drafts.length}</span></div>
          {drafts.length === 0 ? <Empty title="No drafts" /> : <div className="list">{drafts.map((d) => <PostCard key={d.id} post={d} tz={rules.timezone} back="/compose" />)}</div>}
        </section>
      </div>
    </>
  );
}
