import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

function formatCompact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

interface StatTileProps {
  label: string;
  value: number | string;
  hint?: ReactNode;
  className?: string;
}

/** Sentence-case label, semibold auto-compact value — no delta/trend since access overviews have no historical baseline to compare against. */
export function StatTile({ label, value, hint, className }: StatTileProps) {
  return (
    <div className={cn("rounded-lg border bg-[var(--color-surface)] px-4 py-3", className)}>
      <div className="text-xs" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="text-3xl font-semibold mt-0.5">{typeof value === "number" ? formatCompact(value) : value}</div>
      {hint && (
        <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function StatTileRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>;
}

/** Inline magnitude bar for table rows — sequential single hue, matching the app's existing progress-bar convention. */
export function InlineMeter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden" aria-hidden="true">
      <div className="h-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
    </div>
  );
}
