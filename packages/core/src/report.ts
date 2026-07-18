import { writeFileSync } from "node:fs";
import type { RepoMigrationResult } from "./pipeline.js";
import { redact } from "./util/redact.js";

function statusEmoji(status: RepoMigrationResult["status"]): string {
  switch (status) {
    case "success":
      return "OK";
    case "skipped":
      return "SKIPPED";
    case "empty":
      return "EMPTY";
    case "verify_failed":
      return "VERIFY_FAILED";
    case "failed":
    default:
      return "FAILED";
  }
}

export function renderReport(results: RepoMigrationResult[], runStartedAt: string): string {
  const lines: string[] = [];
  lines.push("# glab2gh Migration Report");
  lines.push("");
  lines.push(`Run started: ${runStartedAt}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed" || r.status === "verify_failed").length;
  lines.push(`**Summary:** ${results.length} repo(s) — ${succeeded} succeeded, ${failed} failed, ${results.length - succeeded - failed} other.`);
  lines.push("");

  lines.push("| Repo | Target | Status | Branches | Tags | LFS | Secrets | Warnings |");
  lines.push("|------|--------|--------|----------|------|-----|---------|----------|");
  for (const r of results) {
    lines.push(
      `| ${r.sourcePath} | ${r.targetFullName} | ${statusEmoji(r.status)} | ${r.branches} | ${r.tags} | ${r.lfs ? "yes" : "no"} | ${r.secretsCount} | ${r.warnings.length} |`,
    );
  }
  lines.push("");

  for (const r of results) {
    lines.push(`## ${r.sourcePath} → ${r.targetFullName}`);
    lines.push("");
    lines.push(`- Status: **${statusEmoji(r.status)}**`);
    lines.push(`- Target URL: ${r.targetUrl || "(not created)"}`);
    lines.push(`- Branches: ${r.branches}, Tags: ${r.tags}, LFS: ${r.lfs ? "yes" : "no"}`);
    lines.push(`- Pruned internal refs: ${r.prunedRefs}`);

    if (r.secretMappings.length > 0) {
      lines.push(`- CI/CD variables migrated (${r.secretMappings.length}), names only:`);
      for (const m of r.secretMappings) {
        const renameNote = m.renamed ? ` (renamed from \`${m.originalKey}\`)` : "";
        const fileNote = m.fileType ? " [file-type: write to disk in workflow]" : "";
        lines.push(`  - \`${m.name}\` → ${m.destination}${renameNote}${fileNote}`);
      }
    }

    if (r.protectionResults.length > 0) {
      lines.push(`- Branch protection:`);
      for (const p of r.protectionResults) {
        lines.push(`  - \`${p.pattern}\`: ${p.applied ? "applied" : "FAILED"} — ${p.notes.join("; ")}`);
      }
    }

    if (r.sensitiveFiles.length > 0) {
      lines.push(`- WARNING: committed files matching secret-like patterns (rotate any real credentials):`);
      for (const f of r.sensitiveFiles) {
        lines.push(`  - \`${f}\``);
      }
    }

    if (r.verifyDiff) {
      lines.push(`- Verification FAILED:`);
      lines.push(`  - Missing on target: ${r.verifyDiff.missingOnTarget.join(", ") || "(none)"}`);
      lines.push(`  - SHA mismatches: ${r.verifyDiff.shaMismatch.join(", ") || "(none)"}`);
      lines.push(`  - Extra on target: ${r.verifyDiff.extraOnTarget.join(", ") || "(none)"}`);
    }

    if (r.warnings.length > 0) {
      lines.push(`- Warnings:`);
      for (const w of r.warnings) {
        lines.push(`  - ${w}`);
      }
    }

    if (r.error) {
      lines.push(`- Error: ${r.error}`);
    }

    lines.push("");
  }

  return redact(lines.join("\n"));
}

export function writeReport(results: RepoMigrationResult[], runStartedAt: string, outPath = "migration-report.md"): void {
  const content = renderReport(results, runStartedAt);
  writeFileSync(outPath, content, "utf-8");
}
