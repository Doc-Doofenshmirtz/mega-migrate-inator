"use client";

import { useEffect, useRef, useState } from "react";
import type { LogLine } from "@/lib/useRunEvents";

const LEVEL_COLOR: Record<string, string> = {
  debug: "var(--color-muted)",
  info: "var(--color-fg)",
  warn: "var(--color-warning)",
  error: "var(--color-danger)",
};

export function LogTail({ lines, defaultOpen = false }: { lines: LogLine[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, open]);

  return (
    <div>
      <button
        type="button"
        className="text-xs underline"
        style={{ color: "var(--color-muted)" }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide log" : `Show log (${lines.length})`}
      </button>
      {open && (
        <div
          ref={scrollRef}
          className="mt-2 rounded-md border bg-black/90 text-white p-2 text-xs font-mono overflow-auto"
          style={{ maxHeight: 220 }}
        >
          {lines.length === 0 && <div style={{ color: "var(--color-muted)" }}>No output yet.</div>}
          {lines.map((l) => (
            <div key={l.id} style={{ color: LEVEL_COLOR[l.level] ?? "inherit" }}>
              <span style={{ opacity: 0.5 }}>{l.ts.slice(11, 19)}</span> {l.line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
