import { clarifierPrompt } from "@forge/prompts";
import type { AgentFlag } from "@forge/schema";
import { getModel } from "../../lib/model.ts";
import {
  ClarificationResultSchema,
  type ExplorerState,
} from "../../types.ts";

function normaliseOutput(raw: Record<string, unknown>): Record<string, unknown> {
  // Coerce null answers to empty string
  if (Array.isArray(raw["clarifying_questions"])) {
    raw["clarifying_questions"] = (raw["clarifying_questions"] as Record<string, unknown>[]).map((q) => {
      if (q["answer"] === null || q["answer"] === undefined) {
        console.warn("[clarifier] normalised null answer field");
        return { ...q, answer: "" };
      }
      return q;
    });
  } else {
    console.warn("[clarifier] normalised missing clarifying_questions to []");
    raw["clarifying_questions"] = [];
  }

  // Remove null field_path from agent_flags (Zod expects string | undefined, not null)
  if (Array.isArray(raw["agent_flags"])) {
    raw["agent_flags"] = (raw["agent_flags"] as Record<string, unknown>[]).map((f) => {
      if (f["field_path"] === null) {
        console.warn("[clarifier] normalised null field_path — removed key");
        const { field_path: _, ...rest } = f;
        return rest;
      }
      return f;
    });
  }

  return raw;
}

export async function clarifierNode(
  state: ExplorerState
): Promise<Partial<ExplorerState>> {
  try {
    const systemPrompt = clarifierPrompt.render({
      problem_statement: state.input,
      max_questions: 5,
      project_type_hint: "",
    });

    const response = await getModel().invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this problem statement and produce your clarification output as JSON:\n\n${state.input}`,
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
    const parsed = ClarificationResultSchema.parse(normalised);

    const flags: AgentFlag[] = [...parsed.agent_flags];

    if (parsed.confidence < 0.4) {
      flags.push({
        id: `flag-clarifier-low-confidence-${Date.now()}`,
        agent: "clarifier",
        severity: "blocking",
        message: `Clarifier confidence is critically low: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    } else if (parsed.confidence < 0.6) {
      flags.push({
        id: `flag-clarifier-warning-${Date.now()}`,
        agent: "clarifier",
        severity: "warning",
        message: `Clarifier confidence is below threshold: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    }

    return {
      clarification_result: parsed,
      current_node: "clarifier",
      agent_flags: flags,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown clarifier error";
    return {
      current_node: "clarifier",
      errors: [message],
    };
  }
}
