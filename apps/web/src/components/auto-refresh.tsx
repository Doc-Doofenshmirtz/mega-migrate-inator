"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-runs this route's server component while `active` is true, so
 * list pages (Runs, Job history) pick up status/progress changes without a manual
 * reload. Detail pages already get true live updates over SSE; list pages only need
 * to notice "something changed," so polling is enough and avoids a second live
 * transport. Stops itself once nothing on the page is still active.
 */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
