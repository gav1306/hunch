"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HunchCard } from "@/components/hunch-card";
import { useCreateHunch } from "@/hooks/use-create-hunch";

export default function NewHunchPage() {
  const [rawText, setRawText] = useState("");
  const createHunch = useCreateHunch();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    createHunch.mutate(rawText.trim());
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Drop a hunch</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A vague feeling about your life. The Coach sharpens it into something
        you can actually test.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={3}
          placeholder="coffee after lunch wrecks my sleep…"
          className="w-full resize-none rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          disabled={createHunch.isPending || !rawText.trim()}
        >
          {createHunch.isPending ? "Sharpening…" : "Sharpen it"}
        </Button>
      </form>

      {createHunch.isError && (
        <p className="mt-4 text-sm text-destructive">
          {createHunch.error.message}
        </p>
      )}

      {createHunch.data && (
        <div className="mt-8">
          <HunchCard hunch={createHunch.data} />
        </div>
      )}
    </main>
  );
}
