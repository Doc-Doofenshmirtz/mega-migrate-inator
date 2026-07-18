import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "neutral" | "warning" | "danger" | "success";

const toneClasses: Record<AlertTone, string> = {
  neutral: "border-[var(--color-border)] bg-black/[0.02] dark:bg-white/[0.03]",
  warning: "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10",
  danger: "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10",
  success: "border-[var(--color-success)]/40 bg-[var(--color-success)]/10",
};

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

export function Alert({ className, tone = "neutral", ...props }: AlertProps) {
  return <div className={cn("rounded-md border px-3 py-2 text-sm", toneClasses[tone], className)} {...props} />;
}
