import { Hono } from "hono";
import { z } from "zod";
import { streamSSE } from "hono/streaming";
import { adminClient } from "../lib/supabase.ts";
import { appError } from "../lib/errors.ts";
import { explorerGraph, type ExplorerState } from "@forge/agents";
import { validateReadyForSystem2 } from "@forge/schema";
import type { Json } from "../lib/database.types.ts";

// ─── Validation schemas ──────────────────────────────────────────────────────

const CreateProjectBody = z.object({
  name: z.string().min(1).max(200),
  problem_statement: z.string().min(10).max(10000),
});

// ─── In-memory job store for SSE streaming ───────────────────────────────────

type ExplorerJob = {
  id: string;
  projectId: string;
  discoveryDocumentId: string | null;
  status: "running" | "complete" | "failed";
  events: Array<{ event: string; data: unknown; timestamp: string }>;
  result: ExplorerState | null;
  error: string | null;
};

const jobs = new Map<string, ExplorerJob>();

function getJobForProject(projectId: string): ExplorerJob | undefined {
  for (const job of jobs.values()) {
    if (job.projectId === projectId) return job;
  }
  return undefined;
}

function dbAvailable(): boolean {
  return (
    !!process.env["SUPABASE_URL"] &&
    !!process.env["SUPABASE_SERVICE_ROLE_KEY"]
  );
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const projectsRouter = new Hono();

// POST /api/projects — create a project
projectsRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = CreateProjectBody.safeParse(body);

  if (!parsed.success) {
    throw appError({
      message: "Invalid request body",
      statusCode: 400,
      code: "VALIDATION_ERROR",
      details: parsed.error.issues,
    });
  }

  const { name, problem_statement } = parsed.data;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const id = crypto.randomUUID();

  if (dbAvailable()) {
    const db = adminClient();
    const { error } = await db.from("projects").insert({
      id,
      name,
      slug,
      problem_statement,
      owner_id: "anonymous",
      status: "created",
    });

    if (error) {
      throw appError({
        message: "Failed to create project",
        statusCode: 500,
        code: "DB_INSERT_ERROR",
        details: error.message,
      });
    }

    return c.json({ project_id: id, name, slug, status: "created" }, 201);
  }

  return c.json(
    {
      project_id: id,
      name,
      slug,
      status: "created",
      problem_statement,
      _warning: "Database unavailable. Project exists in-memory only.",
    },
    201
  );
});

// GET /api/projects/:id — get project
projectsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  if (dbAvailable()) {
    const db = adminClient();
    const { data, error } = await db
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (!error && data) return c.json(data);
  }

  const job = getJobForProject(id);
  if (job) {
    return c.json({
      id,
      status: job.status === "complete" ? "explored" : "exploring",
    });
  }

  throw appError({
    message: "Project not found",
    statusCode: 404,
    code: "NOT_FOUND",
  });
});

// POST /api/projects/:id/explore — trigger explorer pipeline
projectsRouter.post("/:id/explore", async (c) => {
  const projectId = c.req.param("id");
  const jobId = crypto.randomUUID();

  // 1. Load project from Supabase
  let problemStatement: string | null = null;

  if (dbAvailable()) {
    const db = adminClient();
    const { data, error } = await db
      .from("projects")
      .select("problem_statement, status")
      .eq("id", projectId)
      .single();

    if (error || !data) {
      throw appError({
        message: "Project not found",
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    problemStatement = data.problem_statement;

    // Update project status to exploring
    await db
      .from("projects")
      .update({ status: "exploring" })
      .eq("id", projectId);
  }

  // Fall back to request body if DB not available
  if (!problemStatement) {
    const body = await c.req.json().catch(() => ({}));
    const ps = (body as Record<string, unknown>)["problem_statement"];
    if (typeof ps === "string" && ps.length > 0) {
      problemStatement = ps;
    }
  }

  if (!problemStatement) {
    throw appError({
      message:
        "Could not find problem_statement. Provide it in the request body or ensure the project exists in the database.",
      statusCode: 400,
      code: "MISSING_PROBLEM_STATEMENT",
    });
  }

  // 2. Create discovery_documents row with status 'draft'
  let discoveryDocumentId: string | null = null;
  if (dbAvailable()) {
    const db = adminClient();
    const { data } = await db
      .from("discovery_documents")
      .insert({
        project_id: projectId,
        version: 1,
        status: "draft",
        document: {} as Json,
        has_blockers: true,
      })
      .select("id")
      .single();
    if (data) discoveryDocumentId = data.id;
  }

  const job: ExplorerJob = {
    id: jobId,
    projectId,
    discoveryDocumentId,
    status: "running",
    events: [],
    result: null,
    error: null,
  };
  jobs.set(jobId, job);

  // 3. Run explorer in the background
  runExplorer(job, problemStatement);

  return c.json({ job_id: jobId, status: "running" }, 202);
});

// GET /api/projects/:id/explore/stream — SSE stream of explorer progress
projectsRouter.get("/:id/explore/stream", (c) => {
  const projectId = c.req.param("id");
  const job = getJobForProject(projectId);

  if (!job) {
    throw appError({
      message: "No explorer job found for this project",
      statusCode: 404,
      code: "JOB_NOT_FOUND",
    });
  }

  return streamSSE(c, async (stream) => {
    let sentIndex = 0;

    while (job.status === "running") {
      while (sentIndex < job.events.length) {
        const evt = job.events[sentIndex]!;
        await stream.writeSSE({
          event: evt.event,
          data: JSON.stringify(evt.data),
        });
        sentIndex++;
      }
      await stream.sleep(500);
    }

    // Send remaining events
    while (sentIndex < job.events.length) {
      const evt = job.events[sentIndex]!;
      await stream.writeSSE({
        event: evt.event,
        data: JSON.stringify(evt.data),
      });
      sentIndex++;
    }

    // Final event
    if (job.status === "complete" && job.result) {
      await stream.writeSSE({
        event: "complete",
        data: JSON.stringify({
          discovery_document: job.result.discovery_document,
          agent_flags: job.result.agent_flags,
        }),
      });
    } else if (job.status === "failed") {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: job.error }),
      });
    }
  });
});

// GET /api/projects/:id/discovery — get discovery document
projectsRouter.get("/:id/discovery", async (c) => {
  const projectId = c.req.param("id");

  if (dbAvailable()) {
    const db = adminClient();
    const { data, error } = await db
      .from("discovery_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (!error && data) return c.json(data);
  }

  const job = getJobForProject(projectId);
  if (job?.result?.discovery_document) {
    return c.json(job.result.discovery_document);
  }

  throw appError({
    message: "No discovery document found",
    statusCode: 404,
    code: "NOT_FOUND",
  });
});

// POST /api/projects/:id/discovery/approve — approve discovery document
projectsRouter.post("/:id/discovery/approve", async (c) => {
  const projectId = c.req.param("id");

  if (!dbAvailable()) {
    throw appError({
      message: "Database required for approval",
      statusCode: 503,
      code: "DB_UNAVAILABLE",
    });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("discovery_documents")
    .update({ status: "approved" })
    .eq("project_id", projectId)
    .eq("status", "pending_review")
    .select()
    .single();

  if (error || !data) {
    throw appError({
      message:
        "Could not approve discovery document. Ensure it exists and is in pending_review status.",
      statusCode: 400,
      code: "APPROVE_FAILED",
    });
  }

  return c.json({ status: "approved", document: data });
});

// ─── Background explorer runner ──────────────────────────────────────────────

async function recordAgentRun(
  job: ExplorerJob,
  agentName: string,
  status: "running" | "complete" | "failed",
  data: { input?: unknown; output?: unknown; confidence?: number | null; flags?: unknown; error?: string }
) {
  if (!dbAvailable()) return;

  const db = adminClient();
  if (status === "running") {
    await db.from("agent_runs").insert({
      project_id: job.projectId,
      discovery_document_id: job.discoveryDocumentId,
      agent_name: agentName,
      status: "running",
      input: (data.input ?? null) as Json,
    });
  } else {
    await db
      .from("agent_runs")
      .update({
        status,
        output: (data.output ?? null) as Json,
        confidence: data.confidence ?? null,
        flags: (data.flags ?? []) as Json,
        error: data.error ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("project_id", job.projectId)
      .eq("agent_name", agentName)
      .eq("status", "running");
  }
}

async function runExplorer(job: ExplorerJob, problemStatement: string) {
  try {
    // Use invoke (single call) to get the final state — no double invocation
    const finalState = await explorerGraph.invoke(
      { input: problemStatement }
    ) as ExplorerState;

    // Emit SSE events for each node that ran based on what's populated
    const nodeResults: Array<{ name: string; confidence: number | null }> = [];

    if (finalState.clarification_result) {
      nodeResults.push({ name: "clarifier", confidence: finalState.clarification_result.confidence });
    }
    if (finalState.decomposition) {
      nodeResults.push({ name: "decomposer", confidence: finalState.decomposition.confidence });
    }
    if (finalState.research_result) {
      nodeResults.push({ name: "research", confidence: finalState.research_result.confidence });
    }
    if (finalState.requirements_result) {
      nodeResults.push({ name: "requirements", confidence: finalState.requirements_result.confidence });
    }
    if (finalState.discovery_document) {
      nodeResults.push({
        name: "synthesis",
        confidence: finalState.discovery_document.overall_confidence,
      });
    }

    if (finalState.current_node === "awaiting_human") {
      // Pipeline was halted at a checkpoint
      for (const nr of nodeResults) {
        job.events.push({
          event: "node_complete",
          data: {
            node: nr.name,
            confidence: nr.confidence,
            flags: finalState.agent_flags.filter(
              (f) => f.agent === nr.name
            ),
            partial_state: { current_node: nr.name, errors: finalState.errors },
          },
          timestamp: new Date().toISOString(),
        });
      }
      job.events.push({
        event: "checkpoint",
        data: {
          type: "blocking_flags",
          message: "Pipeline paused — blocking flags require human review",
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Pipeline ran to completion
      for (const nr of nodeResults) {
        job.events.push({
          event: "node_complete",
          data: {
            node: nr.name,
            confidence: nr.confidence,
            flags: finalState.agent_flags.filter(
              (f) => f.agent === nr.name
            ),
            partial_state: { current_node: nr.name, errors: finalState.errors },
          },
          timestamp: new Date().toISOString(),
        });

        // 4. Record agent runs in DB
        await recordAgentRun(job, nr.name, "running", {
          input: { problem_statement: problemStatement },
        });
        await recordAgentRun(job, nr.name, "complete", {
          confidence: nr.confidence,
          flags: finalState.agent_flags.filter((f) => f.agent === nr.name),
        });
      }
    }

    job.result = finalState;
    job.status = "complete";

    // 5. Save DiscoveryDocument to discovery_documents
    // 6. Call validateReadyForSystem2
    if (dbAvailable() && job.discoveryDocumentId) {
      const db = adminClient();
      const doc = finalState.discovery_document;

      let docStatus: "pending_review" | "approved" = "pending_review";
      let hasBlockers = true;

      if (doc) {
        const readiness = validateReadyForSystem2(doc);
        docStatus = readiness.ready ? "approved" : "pending_review";
        hasBlockers = !readiness.ready;
      }

      await db
        .from("discovery_documents")
        .update({
          status: docStatus,
          document: (doc ?? {}) as Json,
          overall_confidence: doc?.overall_confidence ?? null,
          has_blockers: hasBlockers,
        })
        .eq("id", job.discoveryDocumentId);

      await db
        .from("projects")
        .update({ status: "explored" })
        .eq("id", job.projectId);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    job.error = message;
    job.status = "failed";
    job.events.push({
      event: "error",
      data: { message },
      timestamp: new Date().toISOString(),
    });
  }
}
