import { z } from "zod";
import { AgentFlagSchema, DiscoveryDocumentSchema } from "@forge/schema";
import { Annotation } from "@langchain/langgraph";

// ─── Clarifier output ────────────────────────────────────────────────────────

export const ClarificationResultSchema = z.object({
  refined_problem_statement: z.string(),
  clarifying_questions: z.array(
    z.object({ question: z.string(), answer: z.string() })
  ),
  confidence: z.number().min(0).max(1),
  agent_flags: z.array(AgentFlagSchema),
});
export type ClarificationResult = z.infer<typeof ClarificationResultSchema>;

// ─── Decomposer output ──────────────────────────────────────────────────────

export const DecompositionResultSchema = z.object({
  business_dimension: z.string(),
  system_dimension: z.string(),
  technical_dimension: z.string(),
  user_dimension: z.string(),
  constraints_dimension: z.string(),
  confidence: z.number().min(0).max(1),
  agent_flags: z.array(AgentFlagSchema),
});
export type DecompositionResult = z.infer<typeof DecompositionResultSchema>;

// ─── Research output (stub schema — completed in Phase 7) ────────────────────

export const ResearchResultSchema = z.object({
  alternatives_considered: z.array(z.unknown()),
  relevant_patterns: z.array(z.unknown()),
  known_pitfalls: z.array(z.unknown()),
  prior_art: z.array(z.unknown()),
  confidence: z.number().min(0).max(1),
  agent_flags: z.array(AgentFlagSchema),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

// ─── Requirements output (stub schema — completed in Phase 7) ────────────────

export const RequirementsResultSchema = z.object({
  functional: z.array(z.unknown()),
  non_functional: z.array(z.unknown()),
  scale_profile: z.unknown().optional(),
  confidence: z.number().min(0).max(1),
  agent_flags: z.array(AgentFlagSchema),
});
export type RequirementsResult = z.infer<typeof RequirementsResultSchema>;

// ─── Explorer node names ─────────────────────────────────────────────────────

export type ExplorerNodeName =
  | "clarifier"
  | "decomposer"
  | "research"
  | "requirements"
  | "synthesis"
  | "checkpoint"
  | "awaiting_human";

// ─── Explorer state (LangGraph Annotation) ───────────────────────────────────

export const ExplorerStateAnnotation = Annotation.Root({
  input: Annotation<string>(),
  clarification_result: Annotation<ClarificationResult | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
  decomposition: Annotation<DecompositionResult | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
  research_result: Annotation<ResearchResult | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
  requirements_result: Annotation<RequirementsResult | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
  discovery_document: Annotation<z.infer<typeof DiscoveryDocumentSchema> | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
  current_node: Annotation<ExplorerNodeName | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
  agent_flags: Annotation<z.infer<typeof AgentFlagSchema>[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),
  errors: Annotation<string[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),
  human_feedback: Annotation<string | null>({
    default: () => null,
    reducer: (_prev, next) => next,
  }),
});

export type ExplorerState = typeof ExplorerStateAnnotation.State;
