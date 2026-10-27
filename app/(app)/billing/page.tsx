import { requireUser } from "../../../lib/auth";
import { env } from "../../../lib/env";
import { isPlanId } from "../../../lib/plans";
import { effectivePlan, listAccounts, monthlyUsage } from "../../../lib/store";
import { checkoutAction, portalAction } from "../../actions";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { PageHead } from "../../components/ui";
import { PricingSection } from "../../components/PricingSection";

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

      <PricingSection
        mode="billing"
        currentPlanId={isPlanId(user.plan) ? user.plan : undefined}
        paid={paid}
        billingEnabled={env.billingEnabled}
        checkoutAction={checkoutAction}
      />
    </>
  );
}
