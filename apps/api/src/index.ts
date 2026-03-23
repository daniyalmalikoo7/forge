import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";
import { projectsRouter } from "./routes/projects.ts";
import { toRFC7807 } from "./lib/errors.ts";

const structuredLogger: MiddlewareHandler = async (c, next) => {
  const start = performance.now();
  await next();
  const duration_ms = Math.round(performance.now() - start);
  const log = {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms,
  };
  process.stdout.write(JSON.stringify(log) + "\n");
};

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use("*", cors());
app.use("*", structuredLogger);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route("/api/projects", projectsRouter);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─── Global error handler ────────────────────────────────────────────────────

app.onError((err, c) => {
  // HTTPExceptions from appError() already carry their own Response
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  // Unexpected errors → RFC 7807
  const body = toRFC7807(
    {
      message: "Internal Server Error",
      statusCode: 500,
      code: "INTERNAL_ERROR",
      details: process.env["NODE_ENV"] === "development" ? err.message : undefined,
    },
    c.req.url
  );
  return c.json(body, 500);
});

// ─── Start server ────────────────────────────────────────────────────────────

const port = parseInt(process.env["PORT"] ?? "3001", 10);

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 255, // max allowed — explorer pipeline can take a while
};
