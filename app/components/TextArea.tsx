"use client";

import { useState } from "react";

/** Textarea with a live character counter. Threads allows 500 characters. */
export function CountedTextArea({ name, defaultValue = "", max = 500, rows = 4, id }: { name: string; defaultValue?: string; max?: number; rows?: number; id?: string }) {
  const [value, setValue] = useState(defaultValue);
  const n = [...value].length;
  return (
    <div className="stack-sm">
      <textarea id={id} name={name} rows={rows} value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={id ? `${id}-count` : undefined} />
      <span id={id ? `${id}-count` : undefined} className={`counter ${n > max ? "over" : ""}`}>
        {n} / {max}
      </span>
    </div>
  );
}
