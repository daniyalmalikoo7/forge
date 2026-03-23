"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createProject } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [problemStatement, setProblemStatement] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (problemStatement.trim().length < 10) {
      setError("Please describe your project idea in at least 10 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const name = problemStatement.slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, "").trim();
      const result = await createProject({
        name: name || "new-project",
        problem_statement: problemStatement,
      });
      router.push(`/projects/${result.project_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 pt-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Forge</h1>
        <p className="mt-2 text-slate-500">
          Describe your project idea. Forge will explore, design, and build it.
        </p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Start Discovery</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            placeholder="Describe your project idea..."
            className="min-h-[120px] resize-none"
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            disabled={loading}
          />
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <Button
            onClick={handleSubmit}
            disabled={loading || problemStatement.trim().length < 10}
            className="self-end"
          >
            {loading ? "Creating..." : "Start Discovery"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
