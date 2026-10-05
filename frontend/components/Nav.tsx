"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Library" },
  { href: "/import", label: "Magic Import" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Nav() {
  const path = usePathname();
  if (["/login", "/onboarding"].includes(path) || path.startsWith("/study")) return null;
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-20 flex justify-center gap-1 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`press rounded-full px-4 py-2 text-sm font-medium ${path === t.href ? "bg-[var(--line)] text-fg" : "text-muted"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
