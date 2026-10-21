import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { currentUser } from "../../lib/auth";
import { Flash, flashFrom, type SP } from "../components/Flash";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: SP }) {
  if (await currentUser()) redirect("/dashboard");
  const { error, ok } = await flashFrom(searchParams);
  return (
    <main className="auth-wrap">
      <div className="card card-pad auth-card stack">
        <Link href="/" className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">J</span> ThreadsByJoe
        </Link>
        <div>
          <h1>Sign in</h1>
          <p className="muted small" style={{ marginTop: 4 }}>Welcome back. Joe kept your queue safe.</p>
        </div>
        <Flash ok={ok} error={error} />
        <form action={loginAction} className="stack">
          <label className="field">
            <span className="name">Email</span>
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span className="name">Password</span>
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button className="btn btn-primary" type="submit">Sign in</button>
        </form>
        <p className="small muted">New here? <Link href="/signup">Create an account</Link></p>
      </div>
    </main>
  );
}
