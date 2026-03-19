import { HTTPException } from "hono/http-exception";

export type AppErrorData = {
  message: string;
  statusCode: number;
  code: string;
  details?: unknown;
};

export function toRFC7807(err: AppErrorData, instance?: string) {
  return {
    type: `https://forge.dev/errors/${err.code}`,
    title: err.message,
    status: err.statusCode,
    detail: err.details ? JSON.stringify(err.details) : undefined,
    instance,
  };
}

export function appError(opts: AppErrorData): HTTPException {
  const body = toRFC7807(opts);
  return new HTTPException(opts.statusCode as 400, {
    message: opts.message,
    res: new Response(JSON.stringify(body), {
      status: opts.statusCode,
      headers: { "Content-Type": "application/problem+json" },
    }),
  });
}
