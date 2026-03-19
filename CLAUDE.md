# Forge — CLAUDE.md

## What this project is
Forge is a 3-system agentic SDLC pipeline. You give it a problem statement;
it runs Explorer (System 1) → Designer (System 2) → Builder (System 3) and
produces a production codebase. Each system is a LangGraph multi-agent workflow.

## Monorepo structure
- apps/web        — Next.js 14 frontend (App Router, ShadCN, Tailwind)
- apps/api        — Node.js backend (Hono, Bun runtime, TypeScript strict)
- packages/schema — Shared types. Discovery Document schema is the source of truth
- packages/agents — LangGraph agent graphs (Explorer, Designer, Builder)
- packages/prompts — All LLM system prompts. Never inline prompts in business logic
- packages/evaluators — Eval harness. Every agent output has a judge

## Tech stack (never deviate without flagging it)
- Runtime: Bun everywhere
- Language: TypeScript strict mode, no `any` without justification
- Frontend: Next.js 14 App Router, ShadCN UI, Tailwind CSS
- Backend: Hono  for all validation
- Database: Supabase (Postgres + pgvector for embeddings)
- Agents: LangGraph.js
- LLM: Anthropic Claude (claude-sonnet-4-5 default, claude-opus-4-5 for complex reasoning)
- Auth: Supabase Auth

## Architecture rules (non-negotiable)
1. All LLM calls go through packages/agents — never call Anthropic SDK directly from apps/
2. All prompts live in packages/prompts — never inline system prompts in agent code
3. Discovery Document schema in packages/schema is the contract — never mutate it without an ADR
4. Every agent must emit structured output via Zod schema — no free-form strings crossing agent boundaries
5. Every agent has a corresponding evaluator in packages/evaluators
6. Supabase is the only database — no other persistence layers
7. All API routes use Zod input validation — no raw req.body access

## Code style
- Functional patterns preferred over classes
- Small pure functions with single responsibility
- Async/await only — no .then() chains
- Named exports only — no except Next.js pages
- File names: kebab-case. Type names: PascalCase. Functions: camelCase
- Errors: always typed (never `catch(e: any)`)
- No console.log — use the structured logger at packages/logger

## Agent patterns
- All agents are LangGraph StateGraph nodes
- State is typed with Zod — never pass untyped objects between nodes
- Every node must be pure: same state in → deterministic state out
- Confidence scores (0.0–1.0) required on every agent output
- Assumption flags required when agent fills a field it couldn't confirm
- Flags (agent_flags[]) surface in the UI as human-in-the-loop checkpoints

## Current focus
Building System 1 — Explorer pipeline:
  Clarifier → Decomposer → Research → Requirements → Synthesis

Discovery Document schema is in packages/schema/src/discovery-document.ts
This is the primary output target for System 1.

## Do not touch
- packages/schema/src/discovery-document.ts without explicit instruction
- Any Supabase migration files without running them locallyator thresholds in packages/evaluators/thresholds.ts

## Running locally
bun install          # install all workspaces
bun dev              # start all apps in parallel
bun test             # run all test suites
bun typecheck        # strict TS check across all packages

## When in doubt
Raise a flag in your response. Do not assume. Do not proceed on ambiguous requirements.
State your assumption explicitly, mark it as assumed, and ask me to confirm.
