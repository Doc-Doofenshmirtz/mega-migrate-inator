"use client";

import { useEffect, useState } from "react";
import { TagInput, type TagSuggestion } from "@/components/ui/tag-input";

interface GitlabUserPickerProps {
  usernames: string[];
  onChange: (usernames: string[]) => void;
  invalid?: Set<string>;
}

export function GitlabUserPicker({ usernames, onChange, invalid }: GitlabUserPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/gitlab/users/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          const users = (d.users ?? []) as Array<{ username: string; name: string; avatarUrl: string }>;
          setSuggestions(users.map((u) => ({ value: u.username, label: `${u.username} (${u.name})`, avatarUrl: u.avatarUrl })));
        })
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <TagInput
      values={usernames}
      onChange={onChange}
      onQueryChange={setQuery}
      suggestions={suggestions}
      loadingSuggestions={loading}
      invalid={invalid}
      placeholder="GitLab username…"
    />
  );
}
