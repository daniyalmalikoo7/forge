import { Hono } from "hono";
import { z } from "zod";
import { streamSSE } from "hono/streaming";
import { adminClient } from "../lib/supabase.ts";
import { appError } from "../lib/errors.ts";
import { explorerGraph, type ExplorerState } from "@forge/agents";

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

// ─── DB helpers (return null on failure so callers can fall back) ─────────────

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

  // DB not available — return project anyway for development
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

  // Fallback: check in-memory jobs
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

  // Try to get problem_statement from DB
  let problemStatement: string | null = null;

  if (dbAvailable()) {
    const db = adminClient();
    const { data } = await db
      .from("projects")
      .select("problem_statement")
      .eq("id", projectId)
      .single();
    if (data) problemStatement = data.problem_statement;

    // Update project status to exploring
    await db
      .from("projects")
      .update({ status: "exploring" })
      .eq("id", projectId);
  }

  // Fall back to request body
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

  // Create discovery_documents row
  let discoveryDocumentId: string | null = null;
  if (dbAvailable()) {
    const db = adminClient();
    const { data } = await db
      .from("discovery_documents")
      .insert({
        project_id: projectId,
        version: 1,
        status: "draft",
        document: {},
        has_blockers: true,
      })
      .select("id")
      .single();
    if (data) discoveryDocumentId = data.id;
  }

  const job: ExplorerJob = {
    id: jobId,
    projectId,
    discoveryDocumentId: discoveryDocumentId,
    status: "running",
    events: [],
    result: null,
    error: null,
  };
  jobs.set(jobId, job);

  // Run explorer in the background
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

    // Send final status
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

  // Fallback: check in-memory job
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

  if (!(dbAvailable())) {
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
  data: { input?: unknown; output?: unknown; confidence?: number; flags?: unknown; error?: string }
) {
  if (!(dbAvailable())) return;

  const db = adminClient();
  if (status === "running") {
    await db.from("agent_runs").insert({
      project_id: job.projectId,
      discovery_document_id: job.discoveryDocumentId,
      agent_name: agentName,
      status: "running",
      input: (data.input ?? null) as import("../lib/database.types.ts").Json,
    });
  } else {
    await db
      .from("agent_runs")
      .update({
        status,
        output: (data.output ?? null) as import("../lib/database.types.ts").Json,
        confidence: data.confidence ?? null,
        flags: (data.flags ?? []) as import("../lib/database.types.ts").Json,
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
    const stream = await explorerGraph.stream(
      { input: problemStatement },
      { streamMode: "updates" }
    );

    for await (const event of stream) {
      for (const [nodeName, update] of Object.entries(event)) {
        const stateUpdate = update as Partial<ExplorerState>;

        if (nodeName === "checkpoint") {
          job.events.push({
            event: "checkpoint",
            data: {
              type: "blocking_flags",
              message: "Pipeline paused — blocking flags require human review",
            },
            timestamp: new Date().toISOString(),
          });
        } else {
          const confidence =
            (stateUpdate.clarification_result as Record<string, unknown> | null | undefined)?.["confidence"] as number | undefined ??
            (stateUpdate.decomposition as Record<string, unknown> | null | undefined)?.["confidence"] as number | undefined ??
            undefined;

          job.events.push({
            event: "node_complete",
            data: {
              node: nodeName,
              confidence: confidence ?? null,
              flags: stateUpdate.agent_flags ?? [],
              current_node: stateUpdate.current_node,
            },
            timestamp: new Date().toISOString(),
          });

          // Record agent run completion in DB
          await recordAgentRun(job, nodeName, "complete", {
            output: stateUpdate,
            confidence,
            flags: stateUpdate.agent_flags,
          });
        }
      }
    }

    // Get final state
    const finalState = await explorerGraph.invoke({ input: problemStatement });
    job.result = finalState;
    job.status = "complete";

    // Save discovery document and update project status in DB
    if (dbAvailable()) {
      const db = adminClient();
      const hasBlockers = finalState.agent_flags.some(
        (f: { severity: string; resolved: boolean }) =>
          f.severity === "blocking" && !f.resolved
      );
      const docStatus = hasBlockers ? "pending_review" : "approved";

      if (job.discoveryDocumentId) {
        await db
          .from("discovery_documents")
          .update({
            status: docStatus,
            document: (finalState.discovery_document ?? {}) as import("../lib/database.types.ts").Json,
            overall_confidence: (finalState.discovery_document as Record<string, unknown> | null)?.["overall_confidence"] as number ?? null,
            has_blockers: hasBlockers,
          })
          .eq("id", job.discoveryDocumentId);
      }

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
