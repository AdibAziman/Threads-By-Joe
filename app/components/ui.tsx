import type { ReactNode } from "react";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    draft: ["", "Draft"],
    pending_approval: ["warn", "Needs approval"],
    scheduled: ["info", "Scheduled"],
    publishing: ["info", "Publishing"],
    published: ["ok", "Published"],
    failed: ["bad", "Failed"],
    rejected: ["", "Rejected"],
    new: ["info", "New"],
    approved: ["info", "Approved, sending"],
    sent: ["ok", "Sent"],
    ignored: ["", "Ignored"],
    skipped: ["", "Skipped"],
    active: ["ok", "Active"],
    paused: ["warn", "Paused"],
    needs_reconnect: ["bad", "Reconnect needed"],
  };
  const [tone, label] = map[status] ?? ["", status];
  return (
    <span className={`badge ${tone}`}>
      <i className="dot" />
      {label}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  const tone = mode === "auto" ? "warn" : mode === "copilot" ? "ok" : "";
  const label = { manual: "Manual", copilot: "Copilot", auto: "Auto" }[mode] ?? mode;
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row-wrap">{children}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function fmt(iso: string | null | undefined, tz = "UTC"): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
