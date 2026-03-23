"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DiscoveryDocumentView } from "./DiscoveryDocumentView";
import { startExplore, streamExplore, getDiscovery, refineExplore, type SSEEvent } from "@/lib/api";

type NodeStatus = "idle" | "running" | "complete" | "flagged" | "error" | "carried";

type FlagItem = { id: string; severity: string; message: string; agent?: string; resolved: boolean };

type NodeState = {
  name: string;
  label: string;
  status: NodeStatus;
  confidence: number | null;
  flags: FlagItem[];
  startedAt: number | null;
  durationMs: number | null;
};

type RunRecord = {
  runNumber: number;
  date: string;
  flagCount: number;
  status: string;
  confidences: Record<string, number | null>;
};

const INITIAL_NODES: NodeState[] = [
  { name: "clarifier", label: "Clarifier", status: "idle", confidence: null, flags: [], startedAt: null, durationMs: null },
  { name: "decomposer", label: "Decomposer", status: "idle", confidence: null, flags: [], startedAt: null, durationMs: null },
  { name: "research", label: "Research", status: "idle", confidence: null, flags: [], startedAt: null, durationMs: null },
  { name: "requirements", label: "Requirements", status: "idle", confidence: null, flags: [], startedAt: null, durationMs: null },
  { name: "synthesis", label: "Synthesis", status: "idle", confidence: null, flags: [], startedAt: null, durationMs: null },
];

const STATUS_COLORS: Record<NodeStatus, string> = {
  idle: "bg-slate-50 border-slate-200",
  running: "bg-blue-50 border-blue-200 animate-pulse",
  complete: "bg-green-50 border-green-200",
  flagged: "bg-amber-50 border-amber-200",
  error: "bg-red-50 border-red-200",
  carried: "bg-slate-50 border-slate-200",
};

type Props = {
  projectId: string;
  projectStatus: string;
  projectName?: string;
  onStatusChange?: (status: string) => void;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function FlagList({ flags }: { flags: FlagItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleFlags = flags.filter((f) => !f.resolved);
  if (visibleFlags.length === 0) return null;

  const first = visibleFlags[0]!;
  const preview = first.message.length > 80 ? first.message.slice(0, 80) + "..." : first.message;

  if (visibleFlags.length === 1 && first.message.length <= 80) {
    return <p className="mt-1 text-sm text-amber-600">{first.message}</p>;
  }

  return (
    <div className="mt-1">
      <button onClick={() => setExpanded(!expanded)} className="text-left text-sm text-amber-600 hover:text-amber-800">
        {expanded ? "Collapse" : preview}
        {!expanded && visibleFlags.length > 1 && ` (+${visibleFlags.length - 1} more)`}
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-1">
          {visibleFlags.map((f, i) => (
            <p key={i} className="text-sm text-amber-600">{f.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExplorerView({ projectId, projectStatus, projectName, onStatusChange }: Props) {
  const [nodes, setNodes] = useState<NodeState[]>(INITIAL_NODES);
  const [pipelineStatus, setPipelineStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [showDocument, setShowDocument] = useState(false);
  const [discoveryDoc, setDiscoveryDoc] = useState<Record<string, unknown> | null>(null);
  const [tick, setTick] = useState(0);
  const viewDocRef = useRef<HTMLDivElement>(null);
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Resolution state
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  // Timer
  useEffect(() => {
    if (pipelineStatus !== "running") return;
    const interval = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(interval);
  }, [pipelineStatus]);

  useEffect(() => {
    if (projectStatus === "explored") {
      setPipelineStatus("complete");
      setNodes((prev) => prev.map((n) => ({ ...n, status: "complete" as NodeStatus })));
      getDiscovery(projectId)
        .then((row) => {
          if (row.document && typeof row.document === "object" && "metadata" in row.document) {
            setDiscoveryDoc(row.document);
          }
        })
        .catch(() => {});
    }
  }, [projectId, projectStatus]);

  useEffect(() => {
    if (pipelineStatus === "complete" && discoveryDoc && viewDocRef.current) {
      viewDocRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [pipelineStatus, discoveryDoc]);

  // Collect all unresolved flags/questions from the document
  const allFlags = discoveryDoc
    ? ((discoveryDoc.agent_flags ?? []) as FlagItem[]).filter((f) => !f.resolved && !resolvedIds.has(f.id))
    : [];
  const allQuestions = discoveryDoc
    ? ((discoveryDoc.open_questions ?? []) as Array<Record<string, unknown>>)
        .filter((q) => q.status === "open" && Boolean(q.blocking) && !resolvedIds.has(String(q.id)))
    : [];

  const blockingItems = allFlags.filter((f) => f.severity === "blocking");
  const allBlockersResolved = blockingItems.every((f) => resolvedIds.has(f.id));

  function handleResolve(id: string) {
    setResolvedIds((prev) => { const next = new Set(Array.from(prev)); next.add(id); return next; });
  }

  function runPipeline(invoker: () => Promise<{ job_id: string }>) {
    setPipelineStatus("running");
    onStatusChange?.("exploring");
    const now = Date.now();
    setNodes(INITIAL_NODES.map((n, i) =>
      i === 0 ? { ...n, status: "running", startedAt: now } : n
    ));

    invoker().then(() => {
      const nodeOrder = ["clarifier", "decomposer", "research", "requirements", "synthesis"];
      let completedCount = 0;

      streamExplore(
        projectId,
        (evt: SSEEvent) => {
          if (evt.event === "node_complete") {
            const nodeName = evt.data.node as string;
            const confidence = evt.data.confidence as number | null;
            const eventFlags = (evt.data.flags ?? []) as FlagItem[];
            const nodeFlags = eventFlags.filter((f) => f.agent === nodeName || !f.agent);
            const hasWarnings = nodeFlags.some((f) => f.severity === "warning" || f.severity === "blocking");
            const completeTime = Date.now();
            completedCount++;

            setNodes((prev) =>
              prev.map((n) => {
                if (n.name === nodeName) {
                  return { ...n, status: hasWarnings ? "flagged" : "complete", confidence, flags: nodeFlags, durationMs: n.startedAt ? completeTime - n.startedAt : null };
                }
                const nextIdx = nodeOrder.indexOf(nodeName) + 1;
                if (nextIdx < nodeOrder.length && n.name === nodeOrder[nextIdx] && completedCount < 5) {
                  return { ...n, status: "running", startedAt: completeTime };
                }
                return n;
              })
            );
          }

          if (evt.event === "complete") {
            const doc = evt.data.discovery_document as Record<string, unknown> | null;
            if (doc) setDiscoveryDoc(doc);
            setPipelineStatus("complete");
            onStatusChange?.("explored");

            // Record run history
            setRunHistory((prev) => [
              ...prev,
              {
                runNumber: prev.length + 1,
                date: new Date().toLocaleString(),
                flagCount: ((doc?.agent_flags ?? []) as FlagItem[]).filter((f) => !f.resolved).length,
                status: (doc?.has_blockers as boolean) ? "has blockers" : "ready",
                confidences: {},
              },
            ]);
          }

          if (evt.event === "checkpoint") {
            setPipelineStatus("complete");
            onStatusChange?.("explored");
          }

          if (evt.event === "error") {
            setPipelineStatus("error");
          }
        },
        () => {
          setPipelineStatus((prev) => prev === "running" ? "complete" : prev);
          onStatusChange?.("explored");
        },
        () => setPipelineStatus("error")
      );
    }).catch(() => setPipelineStatus("error"));
  }

  const handleStart = useCallback(() => {
    setResolutions({});
    setResolvedIds(new Set());
    runPipeline(() => startExplore(projectId));
  }, [projectId]);

  const handleRefine = useCallback(() => {
    const resolvedFlagsList = allFlags
      .filter((f) => resolvedIds.has(f.id))
      .map((f) => ({ id: f.id, resolved_answer: resolutions[f.id] ?? "" }));
    const resolvedQuestionsList = allQuestions
      .filter((q) => resolvedIds.has(String(q.id)))
      .map((q) => ({ id: String(q.id), resolved_answer: resolutions[String(q.id)] ?? "" }));

    setResolutions({});
    setResolvedIds(new Set());
    runPipeline(() => refineExplore(projectId, resolvedFlagsList, resolvedQuestionsList));
  }, [projectId, allFlags, allQuestions, resolutions, resolvedIds]);

  if (showDocument && discoveryDoc) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" onClick={() => setShowDocument(false)} className="self-start">
          Back to Pipeline
        </Button>
        <DiscoveryDocumentView document={discoveryDoc} projectId={projectId} projectName={projectName} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      {pipelineStatus === "idle" && (
        <Button onClick={handleStart} className="self-start">
          Run Explorer Pipeline
        </Button>
      )}

      {/* Pipeline nodes */}
      <div className="flex flex-col gap-2">
        {nodes.map((node) => {
          const elapsed = node.status === "running" && node.startedAt
            ? Date.now() - node.startedAt
            : node.durationMs;

          return (
            <Card key={node.name} className={`border ${STATUS_COLORS[node.status]} transition-all`}>
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold">
                  {node.status === "complete" || node.status === "flagged" ? "\u2713"
                    : node.status === "carried" ? "\u2192"
                    : node.status === "error" ? "\u2717" : "\u2022"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium">{node.label}</span>
                    {node.status !== "idle" && (
                      <Badge variant={
                        node.status === "complete" ? "success" :
                        node.status === "flagged" ? "warning" :
                        node.status === "error" ? "destructive" :
                        node.status === "carried" ? "secondary" : "info"
                      }>
                        {node.status === "carried" ? "carried forward" : node.status}
                      </Badge>
                    )}
                    {elapsed != null && (
                      <span className="text-sm text-slate-400">{formatDuration(elapsed)}</span>
                    )}
                  </div>
                  {node.confidence !== null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={node.confidence * 100} className="h-1.5 flex-1" />
                      <span className="text-sm text-slate-500">{Math.round(node.confidence * 100)}%</span>
                    </div>
                  )}
                  <FlagList flags={node.flags} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Flag resolution section */}
      {pipelineStatus === "complete" && (blockingItems.length > 0 || allQuestions.length > 0) && (
        <div className="mt-4">
          <Separator className="mb-4" />
          <h3 className="mb-4 text-xl font-semibold text-slate-800">Resolution Required</h3>
          <p className="mb-4 text-base text-slate-500">
            The pipeline flagged items that need your input. Provide answers below to improve the discovery document.
          </p>

          <div className="flex flex-col gap-4">
            {blockingItems.map((flag) => (
              <Card key={flag.id} className="border-red-200 bg-red-50">
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">blocking</Badge>
                    <span className="text-sm text-slate-500">[{flag.agent}]</span>
                  </div>
                  <p className="text-base text-slate-800">{flag.message}</p>
                  {resolvedIds.has(flag.id) ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <span className="text-lg">&#10003;</span>
                      <span className="text-base">Resolved</span>
                    </div>
                  ) : (
                    <>
                      <Textarea
                        placeholder="Provide your answer..."
                        className="min-h-[60px] bg-white"
                        value={resolutions[flag.id] ?? ""}
                        onChange={(e) => setResolutions((prev) => ({ ...prev, [flag.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="self-end"
                        disabled={!(resolutions[flag.id] ?? "").trim()}
                        onClick={() => handleResolve(flag.id)}
                      >
                        Resolve
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

            {allQuestions.map((q) => {
              const qId = String(q.id);
              return (
                <Card key={qId} className="border-amber-200 bg-amber-50">
                  <CardContent className="flex flex-col gap-3 py-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">open question</Badge>
                      {Boolean(q.blocking) && <Badge variant="destructive">blocking</Badge>}
                    </div>
                    <p className="text-base text-slate-800">{String(q.question)}</p>
                    {resolvedIds.has(qId) ? (
                      <div className="flex items-center gap-2 text-green-700">
                        <span className="text-lg">&#10003;</span>
                        <span className="text-base">Answered</span>
                      </div>
                    ) : (
                      <>
                        <Textarea
                          placeholder="Provide your answer..."
                          className="min-h-[60px] bg-white"
                          value={resolutions[qId] ?? ""}
                          onChange={(e) => setResolutions((prev) => ({ ...prev, [qId]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="self-end"
                          disabled={!(resolutions[qId] ?? "").trim()}
                          onClick={() => handleResolve(qId)}
                        >
                          Resolve
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Re-run button */}
          <Button
            className="mt-4 w-full"
            disabled={!allBlockersResolved}
            onClick={handleRefine}
          >
            Re-run with your answers
          </Button>
          {!allBlockersResolved && (
            <p className="mt-2 text-center text-sm text-slate-500">
              Resolve all blocking items above to enable re-run
            </p>
          )}
        </div>
      )}

      {/* View document button */}
      {pipelineStatus === "complete" && discoveryDoc && blockingItems.length === 0 && (
        <div ref={viewDocRef}>
          <Button onClick={() => setShowDocument(true)}>
            View Discovery Document
          </Button>
        </div>
      )}

      {pipelineStatus === "error" && (
        <p className="text-base text-red-500">Pipeline failed. Check server logs.</p>
      )}

      {/* Conversation history */}
      {runHistory.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {showHistory ? "Hide" : "Show"} run history ({runHistory.length} run{runHistory.length > 1 ? "s" : ""})
          </button>
          {showHistory && (
            <div className="mt-2 flex flex-col gap-2">
              {runHistory.map((run) => (
                <div key={run.runNumber} className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-2 text-sm">
                  <Badge variant="outline">Run {run.runNumber}</Badge>
                  <span className="text-slate-500">{run.date}</span>
                  <span className="text-slate-500">{run.flagCount} flag{run.flagCount !== 1 ? "s" : ""}</span>
                  <Badge variant={run.status === "ready" ? "success" : "warning"}>{run.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
