import Link from "next/link";
import { redirect } from "next/navigation";
import { signupAction } from "../actions";
import { currentUser } from "../../lib/auth";
import { env } from "../../lib/env";
import { userCount } from "../../lib/store";
import { Flash, flashFrom, type SP } from "../components/Flash";
import { TRIAL_DAYS } from "../../lib/plans";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: SP }) {
  if (await currentUser()) redirect("/dashboard");
  const { error, ok } = await flashFrom(searchParams);
  const closed = !env.allowSignup && userCount() > 0;
  return (
    <main className="auth-wrap">
      <div className="card card-pad auth-card stack">
        <Link href="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">J</span> ThreadsByJoe
        </Link>
        <div>
          <h1>Create your account</h1>
          <p className="muted small" style={{ marginTop: 4 }}>{TRIAL_DAYS}-day trial. No card needed. Joe starts in Copilot mode, so nothing posts without you.</p>
        </div>
        <Flash ok={ok} error={error} />
        {closed ? (
          <div className="banner">Sign-ups are closed on this server.</div>
        ) : (
          <form action={signupAction} className="stack">
            <label className="field">
              <span className="name">Email</span>
              <input type="email" name="email" autoComplete="email" required />
            </label>
            <label className="field">
              <span className="name">Password</span>
              <input type="password" name="password" autoComplete="new-password" minLength={10} required />
              <span className="hint">At least 10 characters.</span>
            </label>
            <button className="btn btn-primary" type="submit">Create account</button>
            <p className="small muted">By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
          </form>
        )}
        <p className="small muted">Already have an account? <Link href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
