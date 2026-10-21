import Link from "next/link";
import { currentUser } from "../lib/auth";
import { PLANS, TRIAL_DAYS, type PlanId } from "../lib/plans";

export default async function Landing() {
  const user = await currentUser();
  const cta = user ? { href: "/dashboard", label: "Open dashboard" } : { href: "/signup", label: `Start ${TRIAL_DAYS}-day trial` };
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand" style={{ padding: 0 }}><span className="brand-mark">J</span> ThreadsByJoe</Link>
        <nav className="row" aria-label="Site">
          <a className="btn btn-ghost btn-sm" href="#how">How it works</a>
          <a className="btn btn-ghost btn-sm" href="#pricing">Pricing</a>
          {user ? <Link className="btn btn-sm" href="/dashboard">Dashboard</Link> : <Link className="btn btn-sm" href="/login">Sign in</Link>}
        </nav>
      </header>

      <main className="wrap">
        <section className="hero">
          <div>
            <p className="label" style={{ marginBottom: 14 }}>For Threads creators and small brands</p>
            <h1>Joe writes the posts. <em>You keep the final word.</em></h1>
            <p className="lead">Connect your Threads account and Joe drafts hooks, tips, promos and replies to your commenters in your voice. Approve each one, or switch on Auto when you trust him.</p>
            <div className="row-wrap">
              <Link className="btn btn-primary" href={cta.href} style={{ padding: "10px 18px", fontSize: 15 }}>{cta.label}</Link>
              <a className="btn" href="#how" style={{ padding: "10px 18px", fontSize: 15 }}>See how it works</a>
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>No card needed. Joe starts in Copilot mode: nothing posts without you.</p>
          </div>

          <div className="mock" aria-label="Example of the approval queue">
            <div className="mock-bar"><i /><i /><i /></div>
            <div className="list">
              <div className="item">
                <div className="spread"><span className="badge warn"><i className="dot" />Needs approval</span><span className="badge">Hook</span></div>
                <p className="post-text">You don't have a content problem. You have a decision problem. Pick one topic for 30 days and let the posts get easier.</p>
                <div className="row-wrap"><span className="btn btn-primary btn-sm">Approve</span><span className="btn btn-sm">Post now</span><span className="btn btn-sm btn-ghost">Edit</span></div>
              </div>
              <div className="item">
                <div className="spread"><span className="badge warn"><i className="dot" />Needs approval</span><span className="badge">question</span></div>
                <div className="quote small">"How do you decide how often to post if you have a day job?"</div>
                <p className="post-text small">Pick the cadence you could keep on your worst week, then add from there. Mine is three a week.</p>
                <div className="row-wrap"><span className="btn btn-primary btn-sm">Approve and send</span><span className="btn btn-sm btn-ghost">Ignore</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <p className="label">How it works</p>
          <h2>You choose how much Joe does</h2>
          <p className="muted" style={{ maxWidth: 640, marginBottom: 24 }}>Three modes per account. Switch any time. A pause button and caps keep you in control.</p>
          <div className="grid grid-3">
            {[
              ["Manual", "You ask, Joe writes", "Pick a post type, give a topic, get three variants. You edit and post. Nothing happens in the background."],
              ["Copilot", "Joe drafts, you approve", "Joe fills your posting slots and drafts replies to comments. Everything waits in one queue until you say yes."],
              ["Auto", "Joe runs inside your limits", "Joe posts and answers praise and simple questions himself. Complaints, leads, sensitive topics and anything flagged still wait for you."],
            ].map(([t, s, d]) => (
              <div key={t} className="card card-pad stack-sm">
                <span className="label">{t}</span>
                <h3>{s}</h3>
                <p className="muted small">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <p className="label">Guardrails</p>
          <h2>Built so it can't embarrass you</h2>
          <div className="grid grid-2" style={{ marginTop: 20 }}>
            {[
              ["Official Threads API only", "You sign in on Threads. No passwords, no scraping, no browser bots."],
              ["Caps, quiet hours and spacing", "Daily limits for posts and replies, a minimum gap between posts, and delays before replies so activity looks human."],
              ["Hard safety checks", "Length, banned words, link allowlist, duplicate detection and contact-detail checks run on every draft. Failing drafts are never sent."],
              ["Comments are treated as untrusted", "A comment that tries to give Joe instructions is skipped, not obeyed."],
              ["Everything is logged", "Who did what and when, whether you or Joe. Pause or disconnect any time and your data is deleted."],
              ["An honest limit", "No tool can promise growth or guarantee Meta will never restrict an account. Conservative defaults and Copilot reduce the risk. They do not remove it."],
            ].map(([t, d]) => (
              <div key={t} className="card card-pad stack-sm"><h3>{t}</h3><p className="muted small">{d}</p></div>
            ))}
          </div>
        </section>

        <section className="section" id="pricing">
          <p className="label">Pricing</p>
          <h2>Simple monthly plans</h2>
          <p className="muted" style={{ marginBottom: 24 }}>Every plan starts with a {TRIAL_DAYS}-day trial. Cancel any time.</p>
          <div className="grid grid-3">
            {(["creator", "pro", "agency"] as PlanId[]).map((id) => {
              const p = PLANS[id];
              return (
                <div key={id} className={`card plan ${id === "pro" ? "featured" : ""}`}>
                  <div className="spread"><h3>{p.name}</h3>{id === "pro" && <span className="badge ok">Most popular</span>}</div>
                  <div className="price">${p.priceUsd}<span className="muted small" style={{ fontWeight: 400 }}> / month</span></div>
                  <p className="muted small">{p.blurb}</p>
                  <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                  <Link className={`btn ${id === "pro" ? "btn-primary" : ""}`} href={cta.href} style={{ justifyContent: "center", marginTop: "auto" }}>{cta.label}</Link>
                </div>
              );
            })}
          </div>
        </section>

        <section className="section">
          <p className="label">Questions</p>
          <h2>The honest answers</h2>
          <div className="stack" style={{ marginTop: 20, maxWidth: 760 }}>
            {[
              ["Is this allowed by Threads?", "ThreadsByJoe uses Meta's official Threads API with your permission. Meta's developer policies forbid spam and deception, and Joe's caps and checks are designed around that. We cannot speak for Meta's enforcement decisions on any account."],
              ["Will Joe sound like an AI?", "He writes from your voice notes and example posts, and you can edit anything. You can also switch on a short AI-assisted label if you prefer to disclose."],
              ["Where does my data go?", "Your brand notes and the comments Joe reads are sent to DeepSeek's API to generate text. Access tokens are encrypted at rest. Disconnect an account and its data is deleted. Read the Privacy Policy for the detail."],
              ["Can Joe handle complaints?", "Joe drafts, but never sends replies to complaints, leads, sensitive topics or hostile comments on his own."],
            ].map(([q, a]) => (
              <div key={q}><h3>{q}</h3><p className="muted" style={{ marginTop: 4 }}>{a}</p></div>
            ))}
          </div>
        </section>
      </main>

      <footer className="wrap footer">
        <div className="spread">
          <span>© {new Date().getFullYear()} ThreadsByJoe. Not affiliated with Meta or Threads.</span>
          <span className="row"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></span>
        </div>
      </footer>
    </>
  );
}
