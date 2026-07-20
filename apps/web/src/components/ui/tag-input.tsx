"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Input } from "./input";
import { Badge } from "./badge";
import { Spinner } from "./spinner";

export interface TagSuggestion {
  value: string;
  label: string;
  avatarUrl?: string;
}

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: TagSuggestion[];
  loadingSuggestions?: boolean;
  onQueryChange?: (query: string) => void;
  /** Invalid entries are still shown as chips (so the user sees what was rejected) but flagged with a danger tone. */
  invalid?: Set<string>;
  className?: string;
}

/** Small multi-value chip input, backed by an async suggestion list (username search) — used by both access-management user pickers. */
export function TagInput({ values, onChange, placeholder, suggestions, loadingSuggestions, onQueryChange, invalid, className }: TagInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  function commit(raw: string) {
    const value = raw.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setQuery("");
    onQueryChange?.("");
    setOpen(false);
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(query);
    } else if (e.key === "Backspace" && query === "" && values.length > 0) {
      remove(values[values.length - 1]!);
    }
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setOpen(next.length > 0);
    onQueryChange?.(next);
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-2 focus-within:ring-[var(--color-accent)]">
        {values.map((v) => (
          <Badge key={v} tone={invalid?.has(v) ? "danger" : "neutral"} className="normal-case gap-1">
            {v}
            <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`} className="ml-0.5 opacity-70 hover:opacity-100">
              ×
            </button>
          </Badge>
        ))}
        <input
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none py-0.5"
          placeholder={values.length === 0 ? placeholder : ""}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(query.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loadingSuggestions && <Spinner />}
      </div>
      {open && suggestions && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-[var(--color-surface)] shadow-lg max-h-56 overflow-auto">
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(s.value)}
            >
              {s.avatarUrl && <img src={s.avatarUrl} alt="" className="h-5 w-5 rounded-full" />}
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
