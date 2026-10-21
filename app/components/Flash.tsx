export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className={`banner ${error ? "bad" : "ok"}`} role={error ? "alert" : "status"} style={{ marginBottom: 16 }}>
      {error ?? ok}
    </div>
  );
}

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function flashFrom(sp: SP) {
  const q = await sp;
  const pick = (k: string) => (typeof q[k] === "string" ? (q[k] as string).slice(0, 400) : undefined);
  return { ok: pick("ok"), error: pick("error"), q };
}
