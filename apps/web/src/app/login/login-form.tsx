"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        return;
      }
      router.push(searchParams.get("next") || "/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <Card>
        <CardHeader>
          <CardTitle>glab2gh</CardTitle>
          <CardDescription>This instance is bound to a non-local address and requires a password.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={submitting || !password} className="w-full">
              Sign in
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
