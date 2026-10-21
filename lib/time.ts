type Parts = { y: number; m: number; d: number; h: number; min: number };

export function localParts(date: Date, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const get = (t: string) => Number(fmt.formatToParts(date).find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** Convert a wall-clock time in `tz` to a UTC Date (handles DST by one correction pass). */
export function zonedToUtc(p: Parts, tz: string): Date {
  const guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  const seen = localParts(new Date(guess), tz);
  const seenMs = Date.UTC(seen.y, seen.m - 1, seen.d, seen.h, seen.min);
  return new Date(guess - (seenMs - guess));
}

export function parseHm(hm: string): { h: number; min: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isQuietHours(now: Date, tz: string, start: string, end: string): boolean {
  const s = parseHm(start);
  const e = parseHm(end);
  if (!s || !e) return false;
  const p = localParts(now, tz);
  const cur = p.h * 60 + p.min;
  const a = s.h * 60 + s.min;
  const b = e.h * 60 + e.min;
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}

/** Upcoming slot instants for the next `days` days, in ascending order, strictly after `now`. */
export function upcomingSlots(now: Date, tz: string, times: string[], days: number): Date[] {
  const out: Date[] = [];
  const base = localParts(now, tz);
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.UTC(base.y, base.m - 1, base.d + i));
    for (const t of times) {
      const hm = parseHm(t);
      if (!hm) continue;
      const when = zonedToUtc(
        { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), h: hm.h, min: hm.min },
        tz,
      );
      if (when.getTime() > now.getTime()) out.push(when);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export function jitterMs(maxMinutes: number): number {
  return Math.floor(Math.random() * maxMinutes * 60_000);
}
