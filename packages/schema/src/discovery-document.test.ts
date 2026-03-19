import { describe, expect, test } from "bun:test";
import {
  parseDiscoveryDocument,
  safeParseDiscoveryDocument,
  validateReadyForSystem2,
  computeRiskScore,
  extractAssumedFields,
  createNewVersion,
  getDocumentHealth,
} from "./discovery-document.ts";
import type { DiscoveryDocument } from "./discovery-document.ts";

// ─── Test fixture ────────────────────────────────────────────────────────────

function makeValidDocument(
  overrides: Partial<DiscoveryDocument> = {}
): DiscoveryDocument {
  const base: DiscoveryDocument = {
    metadata: {
      id: "dd-001",
      project_id: "proj-001",
      version: 1,
      status: "approved",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    problem: {
      original_statement: "Build a task manager",
      refined_statement: "Build a task manager for small teams",
      clarifying_questions: [
        { question: "Who is the target user?", answer: "Small dev teams" },
      ],
      confidence: 0.85,
    },
    context: {
      business: { content: "SaaS product", confidence: 0.8, assumed: false },
      system: { content: "Web app + API", confidence: 0.9, assumed: false },
      technical: { content: "Node.js stack", confidence: 0.85, assumed: false },
      user: { content: "Dev teams of 3-10", confidence: 0.8, assumed: false },
      constraints: { content: "Budget < $500/mo", confidence: 0.7, assumed: true },
    },
    goals: [
      {
        id: "g-1",
        description: "Launch MVP in 4 weeks",
        rationale: "Market timing",
        assumed: false,
      },
    ],
    research: {
      alternatives_considered: [
        {
          name: "Trello clone",
          description: "Copy Trello's board approach",
          pros: ["Familiar UX"],
          cons: ["Crowded market"],
          recommended: false,
          assumed: false,
        },
      ],
      relevant_patterns: [
        {
          name: "CQRS",
          description: "Separate reads and writes",
          applicability: "Good for task state",
          assumed: false,
        },
      ],
      known_pitfalls: [
        {
          description: "Over-engineering permissions",
          mitigation: "Start with simple RBAC",
          severity: "medium",
          assumed: false,
        },
      ],
      prior_art: [
        {
          name: "Linear",
          description: "Modern issue tracker",
          relevance: "UX inspiration",
          assumed: false,
        },
      ],
      confidence: 0.8,
    },
    requirements: {
      functional: [
        {
          id: "fr-1",
          title: "Create task",
          description: "Users can create tasks with title and description",
          priority: "must",
          acceptance_criteria: ["Task appears in list after creation"],
          inferred: false,
          assumed: false,
        },
      ],
      non_functional: [
        {
          id: "nfr-1",
          category: "performance",
          description: "Page load under 2s",
          target: "< 2000ms p95",
          inferred: true,
          assumed: true,
        },
      ],
      scale_profile: {
        expected_users: "100-1000",
        expected_requests_per_second: "10-50",
        data_volume: "< 10GB",
        growth_rate: "20% monthly",
        assumed: true,
      },
      confidence: 0.75,
    },
    risks: [
      {
        id: "r-1",
        description: "Scope creep",
        severity: "high",
        likelihood: "likely",
        mitigation: "Strict MoSCoW enforcement",
        assumed: false,
      },
    ],
    open_questions: [],
    decisions_log: [
      {
        id: "dl-1",
        decision: "Use Supabase for auth and database",
        rationale: "Reduces setup time",
        agent: "synthesis",
        timestamp: "2026-01-01T00:00:00Z",
      },
    ],
    agent_flags: [],
    overall_confidence: 0.8,
    has_blockers: false,
  };

  return { ...base, ...overrides };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("parseDiscoveryDocument", () => {
  test("throws on invalid input (missing required fields)", () => {
    expect(() => parseDiscoveryDocument({})).toThrow();
  });

  test("parses a valid document", () => {
    const doc = makeValidDocument();
    const parsed = parseDiscoveryDocument(doc);
    expect(parsed.metadata.id).toBe("dd-001");
  });
});

describe("safeParseDiscoveryDocument", () => {
  test("returns success: false with a readable error message", () => {
    const result = safeParseDiscoveryDocument({ metadata: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
    expect(result.error!.length).toBeGreaterThan(0);
  });

  test("returns success: true for valid document", () => {
    const result = safeParseDiscoveryDocument(makeValidDocument());
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

describe("validateReadyForSystem2", () => {
  test("blocks when status is not 'approved'", () => {
    const doc = makeValidDocument({
      metadata: {
        ...makeValidDocument().metadata,
        status: "draft",
      },
    });
    const result = validateReadyForSystem2(doc);
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.includes("approved"))).toBe(true);
  });

  test("blocks when overall_confidence < 0.7", () => {
    const doc = makeValidDocument({ overall_confidence: 0.5 });
    const result = validateReadyForSystem2(doc);
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.includes("confidence"))).toBe(true);
  });

  test("blocks when there are unresolved blocking questions", () => {
    const doc = makeValidDocument({
      open_questions: [
        {
          id: "q-1",
          question: "What DB?",
          status: "open",
          blocking: true,
        },
      ],
    });
    const result = validateReadyForSystem2(doc);
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.includes("blocking question"))).toBe(true);
  });

  test("blocks when there are unresolved blocking flags", () => {
    const doc = makeValidDocument({
      agent_flags: [
        {
          id: "f-1",
          agent: "clarifier",
          severity: "blocking",
          message: "Low confidence",
          created_at: "2026-01-01T00:00:00Z",
          resolved: false,
        },
      ],
    });
    const result = validateReadyForSystem2(doc);
    expect(result.ready).toBe(false);
    expect(result.reasons.some((r) => r.includes("blocking flag"))).toBe(true);
  });

  test("returns ready: true when all conditions are met", () => {
    const doc = makeValidDocument();
    const result = validateReadyForSystem2(doc);
    expect(result.ready).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

describe("computeRiskScore", () => {
  test("returns 5 for critical + very_likely", () => {
    expect(computeRiskScore("critical", "very_likely")).toBe(5);
  });

  test("returns 1 for low + unlikely", () => {
    expect(computeRiskScore("low", "unlikely")).toBe(1);
  });
});

describe("extractAssumedFields", () => {
  test("returns all paths where assumed === true", () => {
    const doc = makeValidDocument();
    const assumed = extractAssumedFields(doc);
    // context.constraints, requirements.non_functional[0], requirements.scale_profile
    expect(assumed.length).toBeGreaterThan(0);
    expect(assumed.some((p) => p.includes("constraints"))).toBe(true);
    expect(assumed.some((p) => p.includes("scale_profile"))).toBe(true);
  });

  test("returns empty array for object with no assumptions", () => {
    const result = extractAssumedFields({ name: "test", assumed: false });
    expect(result).toHaveLength(0);
  });
});

describe("createNewVersion", () => {
  test("throws if document is not sealed", () => {
    const doc = makeValidDocument();
    expect(() => createNewVersion(doc)).toThrow("sealed");
  });

  test("increments the version number", () => {
    const doc = makeValidDocument({
      metadata: {
        ...makeValidDocument().metadata,
        status: "sealed",
        sealed_at: "2026-01-02T00:00:00Z",
      },
    });
    const newDoc = createNewVersion(doc);
    expect(newDoc.metadata.version).toBe(2);
    expect(newDoc.metadata.status).toBe("draft");
  });
});

describe("getDocumentHealth", () => {
  test("returns 'critical' when blockerCount > 0", () => {
    const doc = makeValidDocument({
      agent_flags: [
        {
          id: "f-1",
          agent: "clarifier",
          severity: "blocking",
          message: "Problem",
          created_at: "2026-01-01T00:00:00Z",
          resolved: false,
        },
      ],
    });
    expect(getDocumentHealth(doc)).toBe("critical");
  });

  test("returns 'warning' when warnings exist", () => {
    const doc = makeValidDocument({
      agent_flags: [
        {
          id: "f-1",
          agent: "clarifier",
          severity: "warning",
          message: "Uncertain",
          created_at: "2026-01-01T00:00:00Z",
          resolved: false,
        },
      ],
    });
    expect(getDocumentHealth(doc)).toBe("warning");
  });

  test("returns 'healthy' when no issues", () => {
    const doc = makeValidDocument();
    expect(getDocumentHealth(doc)).toBe("healthy");
  });
});
