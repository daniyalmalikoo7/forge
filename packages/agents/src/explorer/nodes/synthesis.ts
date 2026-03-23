import { synthesisPrompt } from "@forge/prompts";
import {
  safeParseDiscoveryDocument,
  type AgentFlag,
} from "@forge/schema";
import { getModel } from "../../lib/model.ts";
import type { ExplorerState } from "../../types.ts";

function normaliseOutput(raw: Record<string, unknown>): Record<string, unknown> {
  // Normalise agent_flags — remove null field_path entries
  if (Array.isArray(raw["agent_flags"])) {
    raw["agent_flags"] = (raw["agent_flags"] as Record<string, unknown>[]).map((f) => {
      if (f["field_path"] === null) {
        console.warn("[synthesis] normalised null field_path — removed key");
        const { field_path: _, ...rest } = f;
        return rest;
      }
      return f;
    });
  }

  // Normalise open_questions — null context → remove key
  if (Array.isArray(raw["open_questions"])) {
    raw["open_questions"] = (raw["open_questions"] as Record<string, unknown>[]).map((q) => {
      if (q["context"] === null) {
        const { context: _, ...rest } = q;
        return rest;
      }
      if (q["answer"] === null) {
        const { answer: _, ...rest } = q;
        return rest;
      }
      return q;
    });
  }

  // Normalise problem.clarifying_questions — null answers → ""
  const problem = raw["problem"] as Record<string, unknown> | undefined;
  if (problem && Array.isArray(problem["clarifying_questions"])) {
    problem["clarifying_questions"] = (problem["clarifying_questions"] as Record<string, unknown>[]).map((q) => {
      if (q["answer"] === null || q["answer"] === undefined) {
        console.warn("[synthesis] normalised null answer in problem.clarifying_questions");
        return { ...q, answer: "" };
      }
      return q;
    });
  }

  // Normalise metadata — null sealed_at → remove key
  const metadata = raw["metadata"] as Record<string, unknown> | undefined;
  if (metadata && metadata["sealed_at"] === null) {
    delete metadata["sealed_at"];
  }

  return raw;
}

export async function synthesisNode(
  state: ExplorerState
): Promise<Partial<ExplorerState>> {
  // Check upstream nodes produced valid data before attempting synthesis
  if (!state.clarification_result) {
    return {
      current_node: "synthesis",
      agent_flags: [{
        id: `flag-synthesis-no-clarification-${Date.now()}`,
        agent: "synthesis",
        severity: "blocking",
        message: "Cannot synthesise: clarifier did not produce valid output",
        created_at: new Date().toISOString(),
        resolved: false,
      }],
      errors: ["Synthesis skipped: missing clarification_result"],
    };
  }

  if (!state.decomposition) {
    return {
      current_node: "synthesis",
      agent_flags: [{
        id: `flag-synthesis-no-decomposition-${Date.now()}`,
        agent: "synthesis",
        severity: "blocking",
        message: "Cannot synthesise: decomposer did not produce valid output",
        created_at: new Date().toISOString(),
        resolved: false,
      }],
      errors: ["Synthesis skipped: missing decomposition"],
    };
  }

  try {
    const systemPrompt = synthesisPrompt.render({
      project_id: crypto.randomUUID(),
      original_problem: state.input,
      clarification_json: JSON.stringify(state.clarification_result, null, 2),
      decomposition_json: JSON.stringify(state.decomposition, null, 2),
      research_json: JSON.stringify(state.research_result, null, 2),
      requirements_json: JSON.stringify(state.requirements_result, null, 2),
      accumulated_flags_json: JSON.stringify(state.agent_flags, null, 2),
    });

    const response = await getModel({ maxTokens: 8192 }).invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "Assemble all prior agent outputs into a complete DiscoveryDocument. Output ONLY valid JSON.",
      },
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : (response.content[0] as { text: string }).text;

    // Strip markdown fences if the LLM wraps in ```json ... ```
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const rawJson = JSON.parse(cleaned) as Record<string, unknown>;
    const normalised = normaliseOutput(rawJson);
    const result = safeParseDiscoveryDocument(normalised);

    if (!result.success) {
      const flags: AgentFlag[] = [
        {
          id: `flag-synthesis-validation-failed-${Date.now()}`,
          agent: "synthesis",
          severity: "blocking",
          message: `Synthesis produced invalid DiscoveryDocument: ${result.error}`,
          created_at: new Date().toISOString(),
          resolved: false,
        },
      ];

      return {
        current_node: "synthesis",
        agent_flags: flags,
        errors: [`DiscoveryDocument validation failed: ${result.error}`],
      };
    }

    return {
      discovery_document: result.data,
      current_node: "synthesis",
      agent_flags: [],
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown synthesis error";
    return {
      current_node: "synthesis",
      errors: [message],
    };
  }
}
