const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ProjectCreateInput = {
  name: string;
  problem_statement: string;
};

type ProjectCreateResponse = {
  project_id: string;
  name: string;
  slug: string;
  status: string;
};

type Project = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  problem_statement: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ExploreResponse = {
  job_id: string;
  status: string;
};

type DiscoveryDocumentRow = {
  id: string;
  project_id: string;
  version: number;
  status: string;
  document: Record<string, unknown>;
  overall_confidence: number | null;
  has_blockers: boolean;
  created_at: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).title ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function createProject(input: ProjectCreateInput) {
  return request<ProjectCreateResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProject(id: string) {
  return request<Project>(`/api/projects/${id}`);
}

export function startExplore(projectId: string) {
  return request<ExploreResponse>(`/api/projects/${projectId}/explore`, {
    method: "POST",
  });
}

export function getDiscovery(projectId: string) {
  return request<DiscoveryDocumentRow>(`/api/projects/${projectId}/discovery`);
}

export function approveDiscovery(projectId: string) {
  return request<{ status: string }>(`/api/projects/${projectId}/discovery/approve`, {
    method: "POST",
  });
}

export function refineExplore(
  projectId: string,
  resolvedFlags: Array<{ id: string; resolved_answer: string }>,
  resolvedQuestions: Array<{ id: string; resolved_answer: string }>
) {
  return request<ExploreResponse>(`/api/projects/${projectId}/explore/refine`, {
    method: "POST",
    body: JSON.stringify({ resolved_flags: resolvedFlags, resolved_questions: resolvedQuestions }),
  });
}

export type SSEEvent = {
  event: string;
  data: Record<string, unknown>;
};

export function streamExplore(
  projectId: string,
  onEvent: (evt: SSEEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const es = new EventSource(`${API_BASE}/api/projects/${projectId}/explore/stream`);

  const handler = (type: string) => (e: MessageEvent) => {
    try {
      onEvent({ event: type, data: JSON.parse(e.data) });
    } catch {
      onError(new Error(`Failed to parse SSE data for event: ${type}`));
    }
  };

  es.addEventListener("node_complete", handler("node_complete"));
  es.addEventListener("checkpoint", handler("checkpoint"));
  es.addEventListener("complete", (e: MessageEvent) => {
    try {
      onEvent({ event: "complete", data: JSON.parse(e.data) });
    } catch {
      // ignore
    }
    es.close();
    onDone();
  });
  es.addEventListener("error", (e: MessageEvent) => {
    try {
      onEvent({ event: "error", data: JSON.parse(e.data) });
    } catch {
      // ignore
    }
    es.close();
    onError(new Error("Explorer pipeline failed"));
  });

  es.onerror = () => {
    es.close();
    onDone();
  };

  return () => es.close();
}

export type { Project, ProjectCreateInput, ProjectCreateResponse, DiscoveryDocumentRow };
