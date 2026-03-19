import { z } from "zod";

// ─── Constants ───────────────────────────────────────────────────────────────

export const ASSUMPTION_DISCIPLINE_PROMPT = `
ASSUMPTION DISCIPLINE:
- If you are filling in a field based on inference rather than explicit user input,
  you MUST set "assumed": true on that field.
- If your confidence in a field is below 0.6, you MUST emit an agent_flag with
  severity "warning" explaining what is uncertain.
- If your confidence in a field is below 0.4, you MUST emit an agent_flag with
  severity "blocking" — this will pause the pipeline for human review.
- Never guess silently. Every inference must be visible.
`.trim();

// ─── Enums ───────────────────────────────────────────────────────────────────

export const DocumentStatusSchema = z.enum([
  "draft",
  "pending_review",
  "approved",
  "sealed",
  "superseded",
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const FlagSeveritySchema = z.enum(["info", "warning", "blocking"]);
export type FlagSeverity = z.infer<typeof FlagSeveritySchema>;

export const RiskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskSeverity = z.infer<typeof RiskSeveritySchema>;

export const RiskLikelihoodSchema = z.enum([
  "unlikely",
  "possible",
  "likely",
  "very_likely",
]);
export type RiskLikelihood = z.infer<typeof RiskLikelihoodSchema>;

export const MoSCoWPrioritySchema = z.enum([
  "must",
  "should",
  "could",
  "wont",
]);
export type MoSCoWPriority = z.infer<typeof MoSCoWPrioritySchema>;

export const QuestionStatusSchema = z.enum([
  "open",
  "answered",
  "deferred",
]);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

export const AgentFlagSchema = z.object({
  id: z.string(),
  agent: z.string(),
  severity: FlagSeveritySchema,
  message: z.string(),
  field_path: z.string().optional(),
  created_at: z.string(),
  resolved: z.boolean().default(false),
  resolved_by: z.string().optional(),
});
export type AgentFlag = z.infer<typeof AgentFlagSchema>;

export const ClarifyingQuestionSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

export const ProblemSectionSchema = z.object({
  original_statement: z.string(),
  refined_statement: z.string(),
  clarifying_questions: z.array(ClarifyingQuestionSchema),
  confidence: z.number().min(0).max(1),
});
export type ProblemSection = z.infer<typeof ProblemSectionSchema>;

export const ContextDimensionSchema = z.object({
  content: z.string(),
  confidence: z.number().min(0).max(1),
  assumed: z.boolean().default(false),
});
export type ContextDimension = z.infer<typeof ContextDimensionSchema>;

export const ContextSectionSchema = z.object({
  business: ContextDimensionSchema,
  system: ContextDimensionSchema,
  technical: ContextDimensionSchema,
  user: ContextDimensionSchema,
  constraints: ContextDimensionSchema,
});
export type ContextSection = z.infer<typeof ContextSectionSchema>;

export const GoalSchema = z.object({
  id: z.string(),
  description: z.string(),
  rationale: z.string(),
  assumed: z.boolean().default(false),
});
export type Goal = z.infer<typeof GoalSchema>;

export const AlternativeApproachSchema = z.object({
  name: z.string(),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  recommended: z.boolean(),
  assumed: z.boolean().default(false),
});
export type AlternativeApproach = z.infer<typeof AlternativeApproachSchema>;

export const TechnicalPatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  applicability: z.string(),
  assumed: z.boolean().default(false),
});
export type TechnicalPattern = z.infer<typeof TechnicalPatternSchema>;

export const KnownPitfallSchema = z.object({
  description: z.string(),
  mitigation: z.string(),
  severity: RiskSeveritySchema,
  assumed: z.boolean().default(false),
});
export type KnownPitfall = z.infer<typeof KnownPitfallSchema>;

export const PriorArtSchema = z.object({
  name: z.string(),
  description: z.string(),
  relevance: z.string(),
  url: z.string().optional(),
  assumed: z.boolean().default(false),
});
export type PriorArt = z.infer<typeof PriorArtSchema>;

export const ResearchSectionSchema = z.object({
  alternatives_considered: z.array(AlternativeApproachSchema),
  relevant_patterns: z.array(TechnicalPatternSchema),
  known_pitfalls: z.array(KnownPitfallSchema),
  prior_art: z.array(PriorArtSchema),
  confidence: z.number().min(0).max(1),
});
export type ResearchSection = z.infer<typeof ResearchSectionSchema>;

export const FunctionalRequirementSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: MoSCoWPrioritySchema,
  acceptance_criteria: z.array(z.string()),
  inferred: z.boolean().default(false),
  assumed: z.boolean().default(false),
});
export type FunctionalRequirement = z.infer<typeof FunctionalRequirementSchema>;

export const NonFunctionalRequirementSchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  target: z.string(),
  inferred: z.boolean().default(false),
  assumed: z.boolean().default(false),
});
export type NonFunctionalRequirement = z.infer<typeof NonFunctionalRequirementSchema>;

export const ScaleProfileSchema = z.object({
  expected_users: z.string(),
  expected_requests_per_second: z.string(),
  data_volume: z.string(),
  growth_rate: z.string(),
  assumed: z.boolean().default(true),
});
export type ScaleProfile = z.infer<typeof ScaleProfileSchema>;

export const RequirementsSectionSchema = z.object({
  functional: z.array(FunctionalRequirementSchema),
  non_functional: z.array(NonFunctionalRequirementSchema),
  scale_profile: ScaleProfileSchema,
  confidence: z.number().min(0).max(1),
});
export type RequirementsSection = z.infer<typeof RequirementsSectionSchema>;

export const RiskSchema = z.object({
  id: z.string(),
  description: z.string(),
  severity: RiskSeveritySchema,
  likelihood: RiskLikelihoodSchema,
  mitigation: z.string(),
  assumed: z.boolean().default(false),
});
export type Risk = z.infer<typeof RiskSchema>;

export const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  context: z.string().optional(),
  status: QuestionStatusSchema,
  answer: z.string().optional(),
  blocking: z.boolean().default(false),
});
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;

export const DecisionLogEntrySchema = z.object({
  id: z.string(),
  decision: z.string(),
  rationale: z.string(),
  agent: z.string(),
  timestamp: z.string(),
});
export type DecisionLogEntry = z.infer<typeof DecisionLogEntrySchema>;

export const MetadataSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  version: z.number().int().positive(),
  status: DocumentStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  sealed_at: z.string().optional(),
});
export type Metadata = z.infer<typeof MetadataSchema>;

// ─── Discovery Document ─────────────────────────────────────────────────────

export const DiscoveryDocumentSchema = z.object({
  metadata: MetadataSchema,
  problem: ProblemSectionSchema,
  context: ContextSectionSchema,
  goals: z.array(GoalSchema).min(1),
  research: ResearchSectionSchema,
  requirements: RequirementsSectionSchema,
  risks: z.array(RiskSchema),
  open_questions: z.array(OpenQuestionSchema),
  decisions_log: z.array(DecisionLogEntrySchema),
  agent_flags: z.array(AgentFlagSchema),
  overall_confidence: z.number().min(0).max(1),
  has_blockers: z.boolean(),
});
export type DiscoveryDocument = z.infer<typeof DiscoveryDocumentSchema>;

// ─── Parse helpers ───────────────────────────────────────────────────────────

export function parseDiscoveryDocument(data: unknown): DiscoveryDocument {
  return DiscoveryDocumentSchema.parse(data);
}

export function safeParseDiscoveryDocument(data: unknown): {
  success: boolean;
  data?: DiscoveryDocument;
  error?: string;
} {
  const result = DiscoveryDocumentSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const messages = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { success: false, error: messages };
}

// ─── Validation helpers ──────────────────────────────────────────────────────

export function validateReadyForSystem2(doc: DiscoveryDocument): {
  ready: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (doc.metadata.status !== "approved") {
    reasons.push(`Status is "${doc.metadata.status}", must be "approved"`);
  }

  if (doc.overall_confidence < 0.7) {
    reasons.push(
      `Overall confidence is ${doc.overall_confidence}, must be >= 0.7`
    );
  }

  const unresolvedBlockingQuestions = doc.open_questions.filter(
    (q) => q.blocking && q.status === "open"
  );
  if (unresolvedBlockingQuestions.length > 0) {
    reasons.push(
      `${unresolvedBlockingQuestions.length} unresolved blocking question(s)`
    );
  }

  const unresolvedBlockingFlags = doc.agent_flags.filter(
    (f) => f.severity === "blocking" && !f.resolved
  );
  if (unresolvedBlockingFlags.length > 0) {
    reasons.push(
      `${unresolvedBlockingFlags.length} unresolved blocking flag(s)`
    );
  }

  return { ready: reasons.length === 0, reasons };
}

// ─── Risk scoring ────────────────────────────────────────────────────────────

const SEVERITY_SCORES: Record<RiskSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const LIKELIHOOD_SCORES: Record<RiskLikelihood, number> = {
  unlikely: 1,
  possible: 2,
  likely: 3,
  very_likely: 4,
};

export function computeRiskScore(
  severity: RiskSeverity,
  likelihood: RiskLikelihood
): number {
  const s = SEVERITY_SCORES[severity];
  const l = LIKELIHOOD_SCORES[likelihood];
  // Scale: 1 (low+unlikely) to 5 (critical+very_likely)
  // Formula: round to nearest integer on a 1-5 scale
  return Math.round(1 + ((s * l - 1) / 15) * 4);
}

// ─── Assumption extraction ───────────────────────────────────────────────────

export function extractAssumedFields(
  obj: unknown,
  prefix = ""
): string[] {
  const paths: string[] = [];
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return paths;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      paths.push(...extractAssumedFields(obj[i], `${prefix}[${i}]`));
    }
    return paths;
  }
  const record = obj as Record<string, unknown>;
  if (record["assumed"] === true) {
    paths.push(prefix || ".");
  }
  for (const key of Object.keys(record)) {
    if (key === "assumed") continue;
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    paths.push(...extractAssumedFields(record[key], childPrefix));
  }
  return paths;
}

// ─── Versioning ──────────────────────────────────────────────────────────────

export function createNewVersion(
  doc: DiscoveryDocument
): DiscoveryDocument {
  if (doc.metadata.status !== "sealed") {
    throw new Error(
      `Cannot create new version: document status is "${doc.metadata.status}", must be "sealed"`
    );
  }
  const now = new Date().toISOString();
  return {
    ...doc,
    metadata: {
      ...doc.metadata,
      version: doc.metadata.version + 1,
      status: "draft",
      created_at: now,
      updated_at: now,
      sealed_at: undefined,
    },
  };
}

// ─── Document health ─────────────────────────────────────────────────────────

export type DocumentHealth = "healthy" | "warning" | "critical";

export function getDocumentHealth(doc: DiscoveryDocument): DocumentHealth {
  const blockerCount = doc.agent_flags.filter(
    (f) => f.severity === "blocking" && !f.resolved
  ).length;
  if (blockerCount > 0) return "critical";

  const warningCount = doc.agent_flags.filter(
    (f) => f.severity === "warning" && !f.resolved
  ).length;
  if (warningCount > 0 || doc.overall_confidence < 0.7) return "warning";

  return "healthy";
}
