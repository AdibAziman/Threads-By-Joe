import Link from "next/link";
import { requireActiveAccount } from "../../../lib/active";
import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { getRules } from "../../../lib/store";
import { fetchRepliesAction } from "../../actions";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { ReplyCard, type ConvRow } from "../../components/ReplyCard";
import { Empty, PageHead } from "../../components/ui";

export const metadata = { title: "Replies" };
export const dynamic = "force-dynamic";

const TABS: [string, string, string[]][] = [
  ["needs", "Needs you", ["new", "pending_approval", "failed"]],
  ["sent", "Sent", ["approved", "sent"]],
  ["skipped", "Skipped", ["skipped", "ignored"]],
  ["all", "All", ["new", "pending_approval", "failed", "approved", "sent", "skipped", "ignored"]],
];

export default async function Replies({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { account } = await requireActiveAccount(user);
  const { ok, error, q } = await flashFrom(searchParams);
  const tab = TABS.find(([k]) => k === q.tab) ?? TABS[0];
  const rules = getRules(account.id);
  const marks = tab[2].map(() => "?").join(",");
  const rows = db().prepare(`SELECT * FROM conversations WHERE account_id=? AND status IN (${marks}) ORDER BY COALESCE(sent_at, updated_at) DESC LIMIT 100`).all(account.id, ...tab[2]) as ConvRow[];
  const counts = Object.fromEntries(
    TABS.map(([k, , st]) => [k, (db().prepare(`SELECT COUNT(*) c FROM conversations WHERE account_id=? AND status IN (${st.map(() => "?").join(",")})`).get(account.id, ...st) as { c: number }).c]),
  );

  return (
    <>
      <PageHead title="Replies" sub="Comments on your posts, and what Joe did with each one.">
        <form action={fetchRepliesAction}>
          <input type="hidden" name="accountId" value={account.id} />
          <input type="hidden" name="back" value="/replies" />
          <button className="btn" type="submit">Check for new replies</button>
        </form>
      </PageHead>
      <Flash ok={ok} error={error} />
      {account.mode === "manual" && <div className="banner info" style={{ marginBottom: 16 }}>Manual mode: Joe does not read or draft replies on his own. Use “Check for new replies”, then “Draft with Joe” on any comment.</div>}
      <div className="tabs" role="navigation" aria-label="Reply filters">
        {TABS.map(([k, label]) => (
          <Link key={k} href={k === "needs" ? "/replies" : `/replies?tab=${k}`} aria-current={tab[0] === k ? "page" : undefined}>{label} ({counts[k]})</Link>
        ))}
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <Empty title="Nothing here">Replies appear after the worker polls Threads (every few minutes) or you check manually.</Empty>
        ) : (
          <div className="list">{rows.map((c) => <ReplyCard key={c.id} c={c} tz={rules.timezone} back={`/replies${tab[0] === "needs" ? "" : `?tab=${tab[0]}`}`} />)}</div>
        )}
      </div>
    </>
  );
}
