import Link from "next/link";
import { requireActiveAccount } from "../../../lib/active";
import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { getRules } from "../../../lib/store";
import { localParts, zonedToUtc } from "../../../lib/time";
import { flashFrom, type SP } from "../../components/Flash";
import { PageHead } from "../../components/ui";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function Calendar({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { account } = await requireActiveAccount(user);
  const { q } = await flashFrom(searchParams);
  const rules = getRules(account.id);
  const tz = rules.timezone;
  const nowParts = localParts(new Date(), tz);
  const m = /^(\d{4})-(\d{2})$/.exec(typeof q.m === "string" ? q.m : "");
  const year = m ? +m[1] : nowParts.y;
  const month = m ? +m[2] : nowParts.m;

  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - lead));
  const rangeStart = zonedToUtc({ y: gridStart.getUTCFullYear(), m: gridStart.getUTCMonth() + 1, d: gridStart.getUTCDate(), h: 0, min: 0 }, tz);
  const rangeEnd = new Date(rangeStart.getTime() + cells * 86400_000 + 86400_000);

  const rows = db()
    .prepare("SELECT id, kind, text, status, COALESCE(published_at, scheduled_at) AS at FROM content_items WHERE account_id=? AND status IN ('scheduled','pending_approval','published','publishing','failed') AND COALESCE(published_at, scheduled_at) BETWEEN ? AND ? ORDER BY at")
    .all(account.id, rangeStart.toISOString(), rangeEnd.toISOString()) as { id: string; kind: string; text: string; status: string; at: string }[];
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const p = localParts(new Date(r.at), tz);
    const key = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `/calendar?m=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const todayKey = `${nowParts.y}-${String(nowParts.m).padStart(2, "0")}-${String(nowParts.d).padStart(2, "0")}`;

  return (
    <>
      <PageHead title="Calendar" sub={`Times shown in ${tz}.`}>
        <Link className="btn btn-sm" href={shift(-1)} aria-label="Previous month">←</Link>
        <strong style={{ minWidth: 140, textAlign: "center" }}>{title}</strong>
        <Link className="btn btn-sm" href={shift(1)} aria-label="Next month">→</Link>
        <Link className="btn btn-sm btn-ghost" href="/calendar">Today</Link>
      </PageHead>
      <div className="stack">
        <div className="legend">
          <span><span className="chip published" style={{ display: "inline-block" }}>Published</span></span>
          <span><span className="chip scheduled" style={{ display: "inline-block" }}>Scheduled</span></span>
          <span><span className="chip pending_approval" style={{ display: "inline-block" }}>Needs approval</span></span>
          <span><span className="chip failed" style={{ display: "inline-block" }}>Failed</span></span>
        </div>
        <div className="cal" role="grid" aria-label={title}>
          {DOW.map((d) => (<div key={d} className="dow" role="columnheader">{d}</div>))}
          {Array.from({ length: cells }, (_, i) => {
            const d = new Date(Date.UTC(year, month - 1, 1 - lead + i));
            const key = d.toISOString().slice(0, 10);
            const out = d.getUTCMonth() !== month - 1;
            const items = byDay.get(key) ?? [];
            return (
              <div key={key} className={`day ${out ? "out" : ""} ${key === todayKey ? "today" : ""}`} role="gridcell">
                <span className="n">{d.getUTCDate()}</span>
                {items.slice(0, 3).map((it) => (
                  <Link key={it.id} href={it.status === "pending_approval" ? "/queue" : it.status === "published" ? "/activity" : "/queue"} className={`chip ${it.status === "publishing" ? "scheduled" : it.status}`} title={it.text}>
                    {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(it.at))} {it.text}
                  </Link>
                ))}
                {items.length > 3 && <span className="small muted">+{items.length - 3} more</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
