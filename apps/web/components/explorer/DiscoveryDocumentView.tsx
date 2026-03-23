"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { approveDiscovery } from "@/lib/api";

type Props = {
  document: Record<string, unknown>;
  projectId: string;
  projectName?: string;
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-l-4 border-l-red-500",
  high: "border-l-4 border-l-amber-500",
  medium: "border-l-4 border-l-yellow-400",
  low: "border-l-4 border-l-slate-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  must: "bg-red-100 text-red-800",
  should: "bg-amber-100 text-amber-800",
  could: "bg-blue-100 text-blue-800",
  wont: "bg-slate-100 text-slate-500",
};

function ConfidenceBadge({ value }: { value: number }) {
  if (value >= 0.8) return <Badge className="bg-green-100 text-green-800 border-green-200">High confidence</Badge>;
  if (value >= 0.7) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Good — ready for design</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200">Needs refinement</Badge>;
}

function Section({ title, confidence, defaultOpen, children }: {
  title: string;
  confidence?: number | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-6 rounded-xl border-slate-200">
      <details open={defaultOpen}>
        <summary className="cursor-pointer list-none p-6">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-lg font-semibold">{title}</span>
            {confidence != null && (
              <Badge variant="secondary">{Math.round(confidence * 100)}%</Badge>
            )}
            <span className="text-slate-400 text-sm">&#9660;</span>
          </div>
        </summary>
        <CardContent className="px-6 pb-6 pt-0">
          {children}
        </CardContent>
      </details>
    </Card>
  );
}

export function DiscoveryDocumentView({ document: doc, projectId, projectName }: Props) {
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const problem = doc.problem as Record<string, unknown> | undefined;
  const context = doc.context as Record<string, Record<string, unknown>> | undefined;
  const goals = (doc.goals ?? []) as Array<Record<string, unknown>>;
  const research = doc.research as Record<string, unknown> | undefined;
  const requirements = doc.requirements as Record<string, unknown> | undefined;
  const risks = (doc.risks ?? []) as Array<Record<string, unknown>>;
  const openQuestions = (doc.open_questions ?? []) as Array<Record<string, unknown>>;
  const flags = (doc.agent_flags ?? []) as Array<Record<string, unknown>>;
  const overallConfidence = doc.overall_confidence as number | undefined;
  const hasBlockers = doc.has_blockers as boolean | undefined;

  const functionalReqs = (requirements?.functional ?? []) as Array<Record<string, unknown>>;
  const nonFunctionalReqs = (requirements?.non_functional ?? []) as Array<Record<string, unknown>>;
  const scaleProfileRaw = requirements?.scale_profile;
  const scaleProfile = (scaleProfileRaw != null && typeof scaleProfileRaw === "object")
    ? scaleProfileRaw as Record<string, unknown> : null;

  const blockingFlags = flags.filter((f) => f.severity === "blocking" && !f.resolved);
  const warningFlags = flags.filter((f) => f.severity === "warning" && !f.resolved);

  const problemConfidence = problem?.confidence as number | undefined;
  const researchConfidence = research?.confidence as number | undefined;
  const reqConfidence = requirements?.confidence as number | undefined;

  const displayName = projectName
    ? projectName.length > 40 ? projectName.slice(0, 40) + "..." : projectName
    : "Discovery Document";

  const canApprove = !hasBlockers && (overallConfidence ?? 0) >= 0.7;

  async function handleApprove() {
    setApproving(true);
    setApproveError(null);
    try {
      await approveDiscovery(projectId);
      setApproved(true);
    } catch (err: unknown) {
      setApproveError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[800px]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[800px] items-center justify-between">
          <span className="text-base font-semibold text-slate-700">{displayName}</span>
          {overallConfidence != null && <ConfidenceBadge value={overallConfidence} />}
          <div className="flex items-center gap-2">
            {approved ? (
              <Badge variant="success">Approved</Badge>
            ) : (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving || !canApprove}
                className={canApprove ? "bg-green-600 hover:bg-green-700" : ""}
                title={hasBlockers ? "Resolve blocking flags first" : (overallConfidence ?? 0) < 0.7 ? "Confidence too low" : "Approve for Design"}
              >
                {approving ? "Approving..." : "Approve for Design"}
              </Button>
            )}
            {approveError && <span className="text-sm text-red-500">{approveError}</span>}
          </div>
        </div>
      </div>

      {/* Blocking flags alert */}
      {blockingFlags.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="mb-2 text-base font-semibold text-red-800">Blocking Flags ({blockingFlags.length})</p>
          {blockingFlags.map((f, i) => (
            <p key={i} className="text-base leading-relaxed text-red-700">
              <span className="font-medium">[{String(f.agent)}]</span> {String(f.message)}
            </p>
          ))}
        </div>
      )}

      {/* Warning flags */}
      {warningFlags.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="mb-2 text-base font-semibold text-amber-800">Warnings ({warningFlags.length})</p>
          {warningFlags.map((f, i) => (
            <p key={i} className="text-base leading-relaxed text-amber-700">
              <span className="font-medium">[{String(f.agent)}]</span> {String(f.message)}
            </p>
          ))}
        </div>
      )}

      {/* Problem Framing */}
      <Section title="Problem Framing" confidence={problemConfidence} defaultOpen>
        <blockquote className="border-l-4 border-slate-300 pl-4 text-lg italic leading-relaxed text-slate-800">
          {String(problem?.refined_statement ?? problem?.original_statement ?? "")}
        </blockquote>

        {Boolean(problem?.original_statement) && Boolean(problem?.refined_statement) && (
          <p className="mt-4 text-sm text-slate-500">
            <strong>Original:</strong> {String(problem?.original_statement)}
          </p>
        )}

        {Array.isArray(problem?.clarifying_questions) && (problem?.clarifying_questions as Array<Record<string, unknown>>).length > 0 && (
          <div className="mt-4">
            <p className="mb-3 text-sm font-semibold text-slate-500">Clarifications</p>
            <div className="flex flex-col gap-2">
              {(problem?.clarifying_questions as Array<Record<string, unknown>>).map((q, i) => (
                <div key={i} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-base font-medium text-slate-700">{String(q.question)}</p>
                  {Boolean(q.answer) && String(q.answer).length > 0 && (
                    <p className="mt-1 text-base text-slate-600">{String(q.answer)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Context */}
      {context && (
        <Section title="Context">
          <div className="grid gap-4 md:grid-cols-2">
            {(["business", "system", "technical", "user", "constraints"] as const).map((dim) => {
              const d = context[dim];
              if (!d) return null;
              return (
                <div key={dim} className="rounded-lg bg-slate-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-bold uppercase text-slate-500">{dim}</span>
                    {Boolean(d.assumed) && <Badge variant="warning" className="text-xs">assumed</Badge>}
                  </div>
                  <p className="text-base leading-relaxed text-slate-700">{String(d.content ?? "")}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <Section title="Goals">
          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((g) => (
              <div key={String(g.id)} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-start gap-2">
                  <p className="flex-1 text-base font-medium text-slate-800">{String(g.description)}</p>
                  {Boolean(g.assumed) && <Badge variant="warning" className="shrink-0 text-xs">assumed</Badge>}
                </div>
                {Boolean(g.rationale) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">Why this goal?</summary>
                    <p className="mt-1 text-sm text-slate-500">{String(g.rationale)}</p>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Scale Profile */}
      {scaleProfile && (
        <Section title="Scale Profile">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { label: "Expected Users", value: String(scaleProfile.expected_users ?? "—") },
              { label: "Requests / sec", value: String(scaleProfile.expected_requests_per_second ?? "—") },
              { label: "Data Volume", value: String(scaleProfile.data_volume ?? "—") },
              { label: "Growth Rate", value: String(scaleProfile.growth_rate ?? "—") },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">{m.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{m.value}</p>
                {Boolean(scaleProfile.assumed) && (
                  <Badge variant="warning" className="mt-2 text-xs">assumed</Badge>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Requirements */}
      {(functionalReqs.length > 0 || nonFunctionalReqs.length > 0) && (
        <Section title="Requirements" confidence={reqConfidence}>
          <Tabs defaultValue="functional">
            <TabsList>
              <TabsTrigger value="functional">Functional ({functionalReqs.length})</TabsTrigger>
              <TabsTrigger value="nonfunctional">Non-Functional ({nonFunctionalReqs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="functional">
              <div className="flex flex-col gap-4 pt-2">
                {functionalReqs.map((r) => (
                  <div key={String(r.id)} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">{String(r.id)}</Badge>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[String(r.priority)] ?? ""}`}>
                        {String(r.priority)}
                      </span>
                      <span className="text-base font-medium text-slate-800">{String(r.title)}</span>
                      {Boolean(r.inferred) && <Badge variant="info" className="text-xs">inferred</Badge>}
                    </div>
                    <p className="text-base leading-relaxed text-slate-700">{String(r.description)}</p>
                    {Array.isArray(r.acceptance_criteria) && (r.acceptance_criteria as string[]).length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1 pl-1">
                        {(r.acceptance_criteria as string[]).map((ac, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-500">
                            <span className="mt-1 text-green-500">&#10003;</span>
                            {ac}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="nonfunctional">
              <div className="flex flex-col gap-4 pt-2">
                {nonFunctionalReqs.map((r) => (
                  <div key={String(r.id)} className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
                    <Badge variant="outline" className="shrink-0 font-mono text-xs">{String(r.id)}</Badge>
                    <Badge variant="secondary" className="shrink-0">{String(r.category)}</Badge>
                    <div className="flex-1">
                      <p className="text-base text-slate-700">{String(r.description)}</p>
                      <p className="mt-1 text-base font-medium text-slate-900">Target: {String(r.target)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </Section>
      )}

      {/* Research */}
      {research && (
        <Section title="Research" confidence={researchConfidence}>
          {Array.isArray(research.alternatives_considered) && (research.alternatives_considered as Array<Record<string, unknown>>).length > 0 && (
            <div className="mb-4">
              <p className="mb-3 text-sm font-semibold text-slate-500">Alternatives Considered</p>
              <div className="grid gap-3 md:grid-cols-2">
                {(research.alternatives_considered as Array<Record<string, unknown>>).map((a, i) => (
                  <div key={i} className="rounded-lg bg-slate-50 p-4">
                    <p className="text-base font-medium text-slate-800">{String(a.name)}</p>
                    <p className="mt-1 text-sm text-slate-600">{String(a.description)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(research.relevant_patterns) && (research.relevant_patterns as Array<Record<string, unknown>>).length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-500">Relevant Patterns</p>
              <div className="flex flex-wrap gap-2">
                {(research.relevant_patterns as Array<Record<string, unknown>>).map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-sm">{String(p.name)}</Badge>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <Section title="Risks">
          <div className="flex flex-col gap-4">
            {risks.map((r) => (
              <div
                key={String(r.id)}
                className={`rounded-xl bg-white p-5 shadow-sm ${SEVERITY_BORDER[String(r.severity)] ?? SEVERITY_BORDER.low}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={r.severity === "critical" || r.severity === "high" ? "destructive" : "warning"}>
                    {String(r.severity)}
                  </Badge>
                  <Badge variant="outline">{String(r.likelihood)}</Badge>
                </div>
                <p className="text-base leading-relaxed text-slate-800">{String(r.description)}</p>
                <div className="mt-3 rounded-lg bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">Mitigation</p>
                  <p className="text-base text-green-700">{String(r.mitigation)}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Open Questions */}
      {openQuestions.length > 0 && (
        <Section title="Open Questions">
          <ul className="flex flex-col gap-2">
            {openQuestions.map((q) => (
              <li key={String(q.id)} className="flex items-start gap-3 text-base">
                <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${Boolean(q.blocking) ? "border-red-400 bg-red-50" : "border-slate-300"}`} />
                <span className="text-slate-700">
                  {String(q.question)}
                  {Boolean(q.blocking) && <Badge variant="destructive" className="ml-2 text-xs">blocking</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
