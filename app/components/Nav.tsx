"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, count }: { href: string; children: React.ReactNode; count?: number }) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      <span>{children}</span>
      {count ? <span className="count">{count}</span> : null}
    </Link>
  );
}
