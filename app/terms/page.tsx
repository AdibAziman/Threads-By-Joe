import Link from "next/link";
import { env } from "../../lib/env";

export const metadata = { title: "Terms of Service" };

export default function Terms() {
  return (
    <main className="wrap" style={{ maxWidth: 760, padding: "40px 28px 80px" }}>
      <Link href="/" className="small muted">← ThreadsByJoe</Link>
      <h1 style={{ margin: "16px 0 8px" }}>Terms of Service</h1>
      <p className="muted small">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <div className="stack" style={{ marginTop: 24 }}>
        <section><h2>The service</h2><p className="muted">ThreadsByJoe helps you draft and publish posts and replies on Threads using AI. You connect your own account and you decide how much Joe may do on your behalf.</p></section>
        <section><h2>Your responsibility</h2><p className="muted">You are responsible for everything published from your account, including content drafted by Joe and anything sent in Auto mode. Review drafts, set sensible limits, and follow Threads' and Meta's rules and applicable law, including any disclosure rules for AI-generated or promotional content.</p></section>
        <section><h2>No guarantees</h2><p className="muted">AI output can be wrong, repetitive or inappropriate. We do not promise growth, engagement, sales or that Meta will not limit or restrict your account. The service depends on third-party platforms and may change or stop working if they change.</p></section>
        <section><h2>Acceptable use</h2><p className="muted">Do not use ThreadsByJoe to spam, mislead, harass, impersonate, run fake engagement, or break any law or platform policy. We may suspend accounts that do.</p></section>
        <section><h2>Billing</h2><p className="muted">Paid plans renew monthly until cancelled. You can cancel any time in the billing portal and keep access until the period ends. Taxes may apply.</p></section>
        <section><h2>Liability</h2><p className="muted">To the extent permitted by law, the service is provided as is, and our liability is limited to the amount you paid in the last 3 months.</p></section>
        <section><h2>Contact</h2><p className="muted"><a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a></p></section>
      </div>
    </main>
  );
}
