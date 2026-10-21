import { requireUser } from "../../../lib/auth";
import { env } from "../../../lib/env";
import { PLANS, type PlanId } from "../../../lib/plans";
import { effectivePlan, listAccounts, monthlyUsage } from "../../../lib/store";
import { checkoutAction, portalAction } from "../../actions";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { PageHead } from "../../components/ui";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function Billing({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { ok, error, q } = await flashFrom(searchParams);
  const plan = effectivePlan(user);
  const usage = monthlyUsage(user.id);
  const used = listAccounts(user.id).length;
  const paid = user.plan !== "trial";

  return (
    <>
      <PageHead title="Billing" sub={plan ? `You are on the ${plan.name} plan.` : "Your trial has ended."}>
        {env.billingEnabled && user.stripe_customer_id && (
          <form action={portalAction}><button className="btn" type="submit">Manage subscription</button></form>
        )}
      </PageHead>
      <Flash ok={ok} error={error} />
      {q.status === "success" && <div className="banner ok" style={{ marginBottom: 16 }}>Thanks. Your subscription is being activated and appears here within a minute.</div>}
      {!env.billingEnabled && <div className="banner info" style={{ marginBottom: 16 }}>Billing is switched off on this server, so every account gets Pro limits. Set STRIPE_SECRET_KEY and the price IDs to charge customers.</div>}

      {plan && (
        <div className="grid grid-3" style={{ marginBottom: 20 }}>
          <div className="card stat"><div className="label">Accounts</div><div className="num">{used} / {plan.accounts}</div></div>
          <div className="card stat"><div className="label">Generations this month</div><div className="num">{usage.generations} / {plan.generationsPerMonth}</div></div>
          <div className="card stat"><div className="label">Reply drafts this month</div><div className="num">{usage.replyDrafts} / {plan.replyDraftsPerMonth}</div></div>
        </div>
      )}

      <div className="grid grid-3">
        {(["creator", "pro", "agency"] as PlanId[]).map((id) => {
          const p = PLANS[id];
          const current = paid && user.plan === id;
          return (
            <section key={id} className={`card plan ${id === "pro" ? "featured" : ""}`}>
              <div className="spread"><h2>{p.name}</h2>{current && <span className="badge ok">Current</span>}</div>
              <div className="price">${p.priceUsd}<span className="muted small" style={{ fontWeight: 400 }}> / month</span></div>
              <p className="muted small">{p.blurb}</p>
              <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <form action={checkoutAction} style={{ marginTop: "auto" }}>
                <input type="hidden" name="plan" value={id} />
                <button className={`btn ${id === "pro" ? "btn-primary" : ""}`} type="submit" disabled={!env.billingEnabled || current} style={{ width: "100%", justifyContent: "center" }}>{current ? "Your plan" : paid ? "Switch to " + p.name : "Choose " + p.name}</button>
              </form>
            </section>
          );
        })}
      </div>
    </>
  );
}
