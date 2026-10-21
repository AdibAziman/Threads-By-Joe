import { requireUser } from "../../../lib/auth";
import { env } from "../../../lib/env";
import { effectivePlan, listAccounts } from "../../../lib/store";
import { createDemoAccountAction, disconnectAccountAction } from "../../actions";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { Empty, fmt, ModeBadge, PageHead, StatusBadge } from "../../components/ui";

export const metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default async function Accounts({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { ok, error } = await flashFrom(searchParams);
  const accounts = listAccounts(user.id);
  const plan = effectivePlan(user);
  const room = plan ? accounts.length < plan.accounts : false;

  return (
    <>
      <PageHead title="Accounts" sub="Connect through Threads' official sign-in. ThreadsByJoe never sees your password.">
        {env.threadsConfigured ? (
          <a className={`btn btn-primary ${room ? "" : "btn-ghost"}`} href={room ? "/api/threads/connect" : undefined} aria-disabled={!room}>Connect Threads account</a>
        ) : null}
      </PageHead>
      <Flash ok={ok} error={error} />

      {!env.threadsConfigured && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          <b>Threads is not configured on this server.</b> Create a Meta app with the Threads use case, then set THREADS_APP_ID and THREADS_APP_SECRET. Add <code>{env.appUrl}/api/threads/callback</code> as a redirect URI, <code>{env.appUrl}/api/threads/deauthorize</code> as the deauthorize callback and <code>{env.appUrl}/api/threads/delete</code> as the data deletion URL. See the README for the full walkthrough.
        </div>
      )}
      {plan && !room && <div className="banner info" style={{ marginBottom: 16 }}>Your {plan.name} plan includes {plan.accounts} account{plan.accounts === 1 ? "" : "s"}. Upgrade on the Billing page to add more.</div>}

      <div className="card">
        {accounts.length === 0 ? (
          <Empty title="No accounts yet">
            {env.threadsConfigured ? "Connect your Threads account to start." : env.dryRun ? "Threads is not configured, but you can try everything with a demo account." : "Ask the operator to configure Threads."}
            {env.dryRun && (
              <form action={createDemoAccountAction} style={{ marginTop: 14 }}>
                <button className="btn" type="submit">Add demo account</button>
              </form>
            )}
          </Empty>
        ) : (
          <div className="list">
            {accounts.map((a) => (
              <div className="item" key={a.id}>
                <div className="spread">
                  <div className="row-wrap">
                    <h3>@{a.username}</h3>
                    <StatusBadge status={a.status} />
                    <ModeBadge mode={a.mode} />
                  </div>
                  <div className="row-wrap">
                    {a.status === "needs_reconnect" && env.threadsConfigured && <a className="btn btn-sm btn-primary" href="/api/threads/connect">Reconnect</a>}
                    <form action={disconnectAccountAction}>
                      <input type="hidden" name="accountId" value={a.id} />
                      <button className="btn btn-sm btn-danger" type="submit">Disconnect and delete data</button>
                    </form>
                  </div>
                </div>
                <p className="small muted">
                  {a.token_expires_at ? `Access renews automatically. Current token valid until ${fmt(a.token_expires_at)}.` : "No token expiry recorded."} Disconnecting deletes the stored token, drafts, replies and settings for this account.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {accounts.length > 0 && env.dryRun && (
        <form action={createDemoAccountAction} style={{ marginTop: 14 }}>
          <button className="btn btn-sm btn-ghost" type="submit">Add demo account</button>
        </form>
      )}
    </>
  );
}
