import { requirementsPrompt } from "@forge/prompts";
import type { AgentFlag } from "@forge/schema";
import { getModel } from "../../lib/model.ts";
import {
  RequirementsResultSchema,
  type ExplorerState,
} from "../../types.ts";

function normaliseOutput(raw: Record<string, unknown>): Record<string, unknown> {
  // Remove null field_path from agent_flags
  if (Array.isArray(raw["agent_flags"])) {
    raw["agent_flags"] = (raw["agent_flags"] as Record<string, unknown>[]).map((f) => {
      if (f["field_path"] === null) {
        console.warn("[requirements] normalised null field_path — removed key");
        const { field_path: _, ...rest } = f;
        return rest;
      }
      return f;
    });
  }

  return raw;
}

export async function requirementsNode(
  state: ExplorerState
): Promise<Partial<ExplorerState>> {
  try {
    const clarifiedProblem =
      state.clarification_result?.refined_problem_statement ?? state.input;

    const decomposition = state.decomposition;
    const decompositionSummary = decomposition
      ? `Business: ${decomposition.business_dimension}\nSystem: ${decomposition.system_dimension}\nTechnical: ${decomposition.technical_dimension}\nUser: ${decomposition.user_dimension}\nConstraints: ${decomposition.constraints_dimension}`
      : "No decomposition available.";

    const research = state.research_result;
    const researchSummary = research
      ? JSON.stringify(research, null, 2)
      : "No research available.";

    const systemPrompt = requirementsPrompt.render({
      clarified_problem: clarifiedProblem,
      decomposition_summary: decompositionSummary,
      research_summary: researchSummary,
    });

    const response = await getModel().invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Generate structured requirements for this problem and produce your output as JSON:\n\n${clarifiedProblem}`,
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
    const parsed = RequirementsResultSchema.parse(normalised);

    const flags: AgentFlag[] = [...parsed.agent_flags];

    if (parsed.confidence < 0.4) {
      flags.push({
        id: `flag-requirements-low-confidence-${Date.now()}`,
        agent: "requirements",
        severity: "blocking",
        message: `Requirements confidence is critically low: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    } else if (parsed.confidence < 0.6) {
      flags.push({
        id: `flag-requirements-warning-${Date.now()}`,
        agent: "requirements",
        severity: "warning",
        message: `Requirements confidence is below threshold: ${parsed.confidence}`,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    }

    return {
      requirements_result: parsed,
      current_node: "requirements",
      agent_flags: flags,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown requirements error";
    return {
      current_node: "requirements",
      errors: [message],
    };
  }
}
