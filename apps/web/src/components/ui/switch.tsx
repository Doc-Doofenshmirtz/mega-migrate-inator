"use client";

import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

export function Switch({ checked, onCheckedChange, disabled, id, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-[var(--color-accent)]" : "bg-black/20 dark:bg-white/20",
      )}
      {...aria}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
