const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  css: "css",
  scss: "scss",
  less: "less",
  toml: "toml",
  ini: "ini",
  graphql: "graphql",
  gql: "graphql",
  vue: "markup",
  prisma: "graphql",
};

const EXACT_FILENAME_LANGUAGES: Record<string, string> = {
  Dockerfile: "docker",
  Makefile: "makefile",
  Gemfile: "ruby",
  Rakefile: "ruby",
  ".gitignore": "bash",
  ".env": "bash",
};

/** Best-effort Prism language id for a filename, or null when nothing matches (render as plain text). */
export function guessLanguage(filename: string): string | null {
  if (EXACT_FILENAME_LANGUAGES[filename]) return EXACT_FILENAME_LANGUAGES[filename];
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "";
  return EXTENSION_LANGUAGES[ext] ?? null;
}
