import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90 shadow-[0_2px_12px_-4px_var(--color-accent)]",
  secondary: "bg-[var(--color-surface)] text-[var(--color-fg)] border hover:bg-black/5 dark:hover:bg-white/5",
  outline: "bg-transparent border text-[var(--color-fg)] hover:bg-black/5 dark:hover:bg-white/5",
  ghost: "bg-transparent text-[var(--color-fg)] hover:bg-black/5 dark:hover:bg-white/5",
  danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-sm px-2.5 py-1.5 rounded-md",
  md: "text-sm px-3.5 py-2 rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
