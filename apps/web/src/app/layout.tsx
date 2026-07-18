import type { Metadata } from "next";
import { Bangers } from "next/font/google";
import Link from "next/link";
import { isAuthRequired } from "@/server/auth";
import { SignOutButton } from "@/components/sign-out-button";
import "./globals.css";

const inatorFont = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-inator",
  display: "swap",
});

export const metadata: Metadata = {
  title: "glab2gh — The Mega-Migrate-inator",
  description: "Self-hosted GitLab → GitHub bulk migration, with full history. WITH FULL HISTORY!",
};

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const authActive = isAuthRequired();
  return (
    <html lang="en" className={inatorFont.variable}>
      <body>
        <div className="min-h-screen flex flex-col">
          <div className="hazard-stripe h-1 w-full" />
          <header className="border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full glow-accent"
                  style={{ background: "var(--color-accent)", color: "var(--color-accent-fg)" }}
                >
                  <BoltIcon className="h-5 w-5" />
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-2xl tracking-wide" style={{ color: "var(--color-accent)" }}>
                    glab2gh
                  </span>
                  <span
                    className="hidden sm:inline text-[10px] font-semibold uppercase tracking-widest rounded-full border px-2 py-0.5"
                    style={{ color: "var(--color-muted)" }}
                  >
                    Mega-Migrate-inator
                  </span>
                </span>
              </Link>
              <nav className="text-sm flex gap-4" style={{ color: "var(--color-muted)" }}>
                <Link href="/" className="hover:underline">
                  Runs
                </Link>
                <Link href="/setup" className="hover:underline">
                  Connections
                </Link>
                {authActive && <SignOutButton />}
              </nav>
            </div>
          </header>
          <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
          <footer className="px-4 py-4 text-center text-xs" style={{ color: "var(--color-muted)" }}>
            Built in a lair, not a garage. Every repo, every commit — <span className="font-display tracking-wide">WITH FULL HISTORY.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
