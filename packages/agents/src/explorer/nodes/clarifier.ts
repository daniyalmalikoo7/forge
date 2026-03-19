import { ChatAnthropic } from "@langchain/anthropic";
import { clarifierPrompt } from "@forge/prompts";
import type { AgentFlag } from "@forge/schema";
import {
  ClarificationResultSchema,
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

    const parsed = ClarificationResultSchema.parse(JSON.parse(text));

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
