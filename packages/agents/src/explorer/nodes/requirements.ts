import type { ExplorerState } from "../../types.ts";

export async function requirementsNode(
  state: ExplorerState
): Promise<Partial<ExplorerState>> {
  // Stub — replaced in Phase 7
  return {
    current_node: "requirements",
  };
}
