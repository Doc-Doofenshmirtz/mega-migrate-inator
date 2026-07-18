"use client";

import type { GitlabProject } from "@glab2gh/core";

const KEY = "glab2gh:wizard-draft";

export interface WizardDraft {
  selectedRepos: GitlabProject[];
  options?: Record<string, unknown>;
}

function readDraft(): WizardDraft {
  if (typeof window === "undefined") return { selectedRepos: [] };
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WizardDraft) : { selectedRepos: [] };
  } catch {
    return { selectedRepos: [] };
  }
}

function writeDraft(draft: WizardDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function getSelectedRepos(): GitlabProject[] {
  return readDraft().selectedRepos;
}

export function setSelectedRepos(repos: GitlabProject[]): void {
  writeDraft({ ...readDraft(), selectedRepos: repos });
}

export function getDraftOptions<T>(): T | undefined {
  return readDraft().options as T | undefined;
}

export function setDraftOptions(options: Record<string, unknown>): void {
  writeDraft({ ...readDraft(), options });
}
