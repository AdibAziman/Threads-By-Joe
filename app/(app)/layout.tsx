import Link from "next/link";
import { activeAccount } from "../../lib/active";
import { isKilled } from "../../lib/audit";
import { requireUser } from "../../lib/auth";
import { env } from "../../lib/env";
import { effectivePlan, pendingCounts } from "../../lib/store";
import { logoutAction, switchAccountAction } from "../actions";
import { NavLink } from "../components/Nav";
import { ModeBadge } from "../components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { account, all } = await activeAccount(user);
  const pending = pendingCounts(user.id);
  const plan = effectivePlan(user);
  const trialDays = user.plan === "trial" && user.trial_ends_at ? Math.max(0, Math.ceil((new Date(user.trial_ends_at).getTime() - Date.now()) / 86400_000)) : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">J</span> ThreadsByJoe
        </Link>

        {all.length > 0 && account && (
          <form action={switchAccountAction} className="stack-sm">
            <input type="hidden" name="back" value="/dashboard" />
            <label className="label" htmlFor="acct">Account</label>
            {all.length > 1 ? (
              <div className="row">
                <select id="acct" name="accountId" defaultValue={account.id}>
                  {all.map((a) => (
                    <option key={a.id} value={a.id}>@{a.username}</option>
                  ))}
                </select>
                <button className="btn btn-sm" type="submit">Go</button>
              </div>
            ) : (
              <div className="spread">
                <strong>@{account.username}</strong>
                <ModeBadge mode={account.mode} />
              </div>
            )}
          </form>
        )}

        <nav className="nav" aria-label="Main">
          <NavLink href="/dashboard">Overview</NavLink>
          <NavLink href="/compose">Compose</NavLink>
          <NavLink href="/queue" count={pending.posts + pending.replies}>Approval queue</NavLink>
          <NavLink href="/calendar">Calendar</NavLink>
          <NavLink href="/replies">Replies</NavLink>
          <NavLink href="/joe">Joe settings</NavLink>
          <NavLink href="/activity">Activity</NavLink>
          <NavLink href="/accounts">Accounts</NavLink>
          <NavLink href="/billing">Billing</NavLink>
        </nav>

        <div className="sidebar-foot">
          {trialDays !== null && env.billingEnabled && (
            <div className="banner info small">{trialDays > 0 ? `${trialDays} day${trialDays === 1 ? "" : "s"} left in your trial.` : "Your trial has ended."} <Link href="/billing">Choose a plan</Link></div>
          )}
          <div className="small muted" style={{ wordBreak: "break-all" }}>{user.email}</div>
          <form action={logoutAction}>
            <button className="btn btn-sm btn-ghost" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <main className="main">
        {isKilled() && <div className="banner bad" style={{ marginBottom: 16 }}>The operator has switched Joe off for every account. Nothing is being posted or sent.</div>}
        {env.dryRun && <div className="banner warn" style={{ marginBottom: 16 }}><b>Dry run.</b> Nothing is actually published to Threads. Set DRY_RUN=0 on the server when you are ready to go live.</div>}
        {!plan && env.billingEnabled && <div className="banner bad" style={{ marginBottom: 16 }}>Your trial has ended, so Joe has stopped generating. <Link href="/billing">Choose a plan</Link> to continue.</div>}
        {account?.status === "needs_reconnect" && <div className="banner bad" style={{ marginBottom: 16 }}>@{account.username} needs to be reconnected. <Link href="/accounts">Reconnect</Link></div>}
        {children}
      </main>
    </div>
  );
}
