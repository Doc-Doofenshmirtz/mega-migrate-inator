"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DialogSize = "md" | "lg" | "xl";

const sizeClasses: Record<DialogSize, string> = {
  md: "w-full max-w-lg",
  lg: "w-full max-w-3xl",
  xl: "w-full max-w-5xl",
};

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  size?: DialogSize;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Built on the native <dialog> element rather than a hand-rolled overlay: showModal()/
 * close() give focus-trapping, Escape-to-close, and top-layer stacking for free — and
 * nested dialogs (e.g. a confirm dialog opened from within this one) just work, each
 * getting its own top-layer entry with Escape closing only the innermost.
 */
export function Dialog({ open, onClose, title, size = "md", footer, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cn("rounded-lg border p-0 backdrop:bg-black/50", sizeClasses[size])}
      style={{ background: "var(--color-surface)", color: "var(--color-fg)", borderColor: "var(--color-border)" }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="px-5 py-4 border-b flex items-center justify-between gap-4">
        <h2 className="font-semibold truncate">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: "var(--color-muted)" }}
        >
          ×
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && <div className="px-5 py-4 border-t flex items-center justify-end gap-2">{footer}</div>}
    </dialog>
  );
}
