import { decomposerPrompt } from "@forge/prompts";
import type { AgentFlag } from "@forge/schema";
import { getModel } from "../../lib/model.ts";
import {
  DecompositionResultSchema,
  type ExplorerState,
} from "../../types.ts";

const DIMENSION_KEYS = [
  "business_dimension",
  "system_dimension",
  "technical_dimension",
  "user_dimension",
  "constraints_dimension",
] as const;

function normaliseOutput(raw: Record<string, unknown>): Record<string, unknown> {
  for (const key of DIMENSION_KEYS) {
    const val = raw[key];
    if (val !== null && val !== undefined && typeof val === "object") {
      // LLM returned an object — extract text or stringify
      const obj = val as Record<string, unknown>;
      if (typeof obj["text"] === "string") {
        console.warn(`[decomposer] normalised ${key}: extracted .text from object`);
        raw[key] = obj["text"];
      } else if (typeof obj["description"] === "string") {
        console.warn(`[decomposer] normalised ${key}: extracted .description from object`);
        raw[key] = obj["description"];
      } else {
        console.warn(`[decomposer] normalised ${key}: JSON.stringified object`);
        raw[key] = JSON.stringify(val);
      }
    }
  }

  // Remove null field_path from agent_flags
  if (Array.isArray(raw["agent_flags"])) {
    raw["agent_flags"] = (raw["agent_flags"] as Record<string, unknown>[]).map((f) => {
      if (f["field_path"] === null) {
        console.warn("[decomposer] normalised null field_path — removed key");
        const { field_path: _, ...rest } = f;
        return rest;
      }
      return f;
    });
  }

  return raw;
}

export async function decomposerNode(
  state: ExplorerState
): Promise<Partial<ExplorerState>> {
  try {
    const clarifiedProblem =
      state.clarification_result?.refined_problem_statement ?? state.input;

    const systemPrompt = decomposerPrompt.render({
      clarified_problem: clarifiedProblem,
      existing_systems: "",
    });

    const response = await getModel().invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Decompose this problem across the 5 dimensions and produce your output as JSON:\n\n${clarifiedProblem}`,
      },
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : (response.content[0] as { text: string }).text;

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const rawJson = JSON.parse(cleaned) as Record<string, unknown>;
    const normalised = normaliseOutput(rawJson);
    const parsed = DecompositionResultSchema.parse(normalised);

    const flags: AgentFlag[] = [...parsed.agent_flags];

    if (parsed.confidence < 0.4) {
      flags.push({
        id: `flag-decomposer-low-confidence-${Date.now()}`,
        agent: "decomposer",
        severity: "blocking",
        message: `Decomposer confidence is critically low: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    } else if (parsed.confidence < 0.6) {
      flags.push({
        id: `flag-decomposer-warning-${Date.now()}`,
        agent: "decomposer",
        severity: "warning",
        message: `Decomposer confidence is below threshold: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    }

    return {
      decomposition: parsed,
      current_node: "decomposer",
      agent_flags: flags,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown decomposer error";
    return {
      current_node: "decomposer",
      errors: [message],
    };
  }
}
