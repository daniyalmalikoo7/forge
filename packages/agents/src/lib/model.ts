import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

type ModelOptions = {
  maxTokens?: number;
};

export function getModel(opts: ModelOptions = {}): BaseChatModel {
  const provider = process.env["MODEL_PROVIDER"] ?? "anthropic";

  if (provider === "openrouter") {
    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey) throw new Error("OPENROUTER_API_KEY env var is required when MODEL_PROVIDER=openrouter");

    return new ChatOpenAI({
      modelName: "google/gemini-2.5-flash",
      apiKey,
      temperature: 0,
      maxTokens: opts.maxTokens ?? 4096,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
    });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is required when MODEL_PROVIDER=anthropic");

  return new ChatAnthropic({
    modelName: "claude-sonnet-4-5-20250514",
    temperature: 0,
    maxTokens: opts.maxTokens ?? 4096,
  });
}
