export type PromptVariable = string | number | boolean;
export type PromptVariables = Record<string, PromptVariable>;

export interface PromptTemplate<T extends PromptVariables = PromptVariables> {
  name: string;
  version: string;
  description: string;
  variables: (keyof T)[];
  render: (vars: T) => string;
}
