import type { Metadata } from "next";
import Link from "next/link";
import { isAuthRequired } from "@/server/auth";
import { SignOutButton } from "@/components/sign-out-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "glab2gh",
  description: "Self-hosted GitLab → GitHub bulk migration",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const authActive = isAuthRequired();
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
              <Link href="/" className="font-semibold tracking-tight">
                glab2gh
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
        </div>
      </body>
    </html>
  );
}
