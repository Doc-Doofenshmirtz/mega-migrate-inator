import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-md border bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none",
        "focus:ring-2 focus:ring-[var(--color-accent)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
