import { ChatAnthropic } from "@langchain/anthropic";
import { decomposerPrompt } from "@forge/prompts";
import type { AgentFlag } from "@forge/schema";
import {
  DecompositionResultSchema,
  type ExplorerState,
} from "../../types.ts";

let _model: ChatAnthropic | null = null;
function getModel(): ChatAnthropic {
  if (!_model) {
    _model = new ChatAnthropic({
      modelName: "claude-sonnet-4-5-20250514",
      temperature: 0,
      maxTokens: 4096,
    });
  }
  return _model;
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

    const parsed = DecompositionResultSchema.parse(JSON.parse(text));

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
