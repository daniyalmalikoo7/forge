import { StateGraph, START, END } from "@langchain/langgraph";
import { ExplorerStateAnnotation, type ExplorerState } from "../types.ts";
import {
  clarifierNode,
  decomposerNode,
  researchNode,
  requirementsNode,
  synthesisNode,
} from "./nodes/index.ts";

function hasBlockingFlags(state: ExplorerState): boolean {
  return state.agent_flags.some(
    (f) => f.severity === "blocking" && !f.resolved
  );
}

function checkpointNode(
  state: ExplorerState
): Partial<ExplorerState> {
  return {
    current_node: "awaiting_human",
  };
}

function afterClarifier(state: ExplorerState): "checkpoint" | "decomposer" {
  return hasBlockingFlags(state) ? "checkpoint" : "decomposer";
}

function afterDecomposer(state: ExplorerState): "checkpoint" | "research" {
  return hasBlockingFlags(state) ? "checkpoint" : "research";
}

function afterResearch(state: ExplorerState): "checkpoint" | "requirements" {
  return hasBlockingFlags(state) ? "checkpoint" : "requirements";
}

function afterRequirements(state: ExplorerState): "checkpoint" | "synthesis" {
  return hasBlockingFlags(state) ? "checkpoint" : "synthesis";
}

function afterSynthesis(state: ExplorerState): "checkpoint" | "__end__" {
  return hasBlockingFlags(state) ? "checkpoint" : "__end__";
}

const workflow = new StateGraph(ExplorerStateAnnotation)
  .addNode("clarifier", clarifierNode)
  .addNode("decomposer", decomposerNode)
  .addNode("research", researchNode)
  .addNode("requirements", requirementsNode)
  .addNode("synthesis", synthesisNode)
  .addNode("checkpoint", checkpointNode)
  .addEdge(START, "clarifier")
  .addConditionalEdges("clarifier", afterClarifier, [
    "checkpoint",
    "decomposer",
  ])
  .addConditionalEdges("decomposer", afterDecomposer, [
    "checkpoint",
    "research",
  ])
  .addConditionalEdges("research", afterResearch, [
    "checkpoint",
    "requirements",
  ])
  .addConditionalEdges("requirements", afterRequirements, [
    "checkpoint",
    "synthesis",
  ])
  .addConditionalEdges("synthesis", afterSynthesis, [
    "checkpoint",
    "__end__",
  ])
  .addEdge("checkpoint", END);

export const explorerGraph = workflow.compile();
