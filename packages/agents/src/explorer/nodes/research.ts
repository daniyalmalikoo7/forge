import { researchPrompt } from "@forge/prompts";
import type { AgentFlag } from "@forge/schema";
import { getModel } from "../../lib/model.ts";
import {
  ResearchResultSchema,
  type ExplorerState,
} from "../../types.ts";

function normaliseOutput(raw: Record<string, unknown>): Record<string, unknown> {
  // Remove null field_path from agent_flags
  if (Array.isArray(raw["agent_flags"])) {
    raw["agent_flags"] = (raw["agent_flags"] as Record<string, unknown>[]).map((f) => {
      if (f["field_path"] === null) {
        console.warn("[research] normalised null field_path — removed key");
        const { field_path: _, ...rest } = f;
        return rest;
      }
      return f;
    });
  }

  // Remove null url from prior_art entries
  if (Array.isArray(raw["prior_art"])) {
    raw["prior_art"] = (raw["prior_art"] as Record<string, unknown>[]).map((p) => {
      if (p["url"] === null) {
        const { url: _, ...rest } = p;
        return rest;
      }
      return p;
    });
  }

  return raw;
}

export async function researchNode(
  state: ExplorerState
): Promise<Partial<ExplorerState>> {
  try {
    const clarifiedProblem =
      state.clarification_result?.refined_problem_statement ?? state.input;

    const decomposition = state.decomposition;
    const decompositionSummary = decomposition
      ? `Business: ${decomposition.business_dimension}\nSystem: ${decomposition.system_dimension}\nTechnical: ${decomposition.technical_dimension}\nUser: ${decomposition.user_dimension}\nConstraints: ${decomposition.constraints_dimension}`
      : "No decomposition available.";

    const systemPrompt = researchPrompt.render({
      clarified_problem: clarifiedProblem,
      decomposition_summary: decompositionSummary,
    });

    const response = await getModel().invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Research this problem space and produce your output as JSON:\n\n${clarifiedProblem}`,
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
    const parsed = ResearchResultSchema.parse(normalised);

    const flags: AgentFlag[] = [...parsed.agent_flags];

    if (parsed.confidence < 0.4) {
      flags.push({
        id: `flag-research-low-confidence-${Date.now()}`,
        agent: "research",
        severity: "blocking",
        message: `Research confidence is critically low: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    } else if (parsed.confidence < 0.6) {
      flags.push({
        id: `flag-research-warning-${Date.now()}`,
        agent: "research",
        severity: "warning",
        message: `Research confidence is below threshold: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    }

    return {
      research_result: parsed,
      current_node: "research",
      agent_flags: flags,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown research error";
    return {
      current_node: "research",
      errors: [message],
    };
  }
}
