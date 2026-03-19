# Forge — From Step 8 to Working System
## The exact prompts to type into Claude Code, in order

The core rule: you never manually create files or run setup commands.
You open Claude Code, give it context, and tell it what to do.
Your job is to review its work, answer its questions, and make decisions.

---

## How to use this guide

Every code block that starts with `→ CLAUDE CODE:` is something you
paste into the Claude Code terminal. Nothing else. You don't touch the keyboard
for anything except reviewing diffs and answering Claude Code's questions.

---

## PHASE 0 — Verify your setup is actually correct

Before building anything, confirm the foundation is solid.
Open a terminal, go to your forge folder, and run:

```bash
cd ~/path/to/forge
claude
```

Once Claude Code is open, paste this exactly:

→ CLAUDE CODE:
```
Read CLAUDE.md carefully. Then do the following checks and report on each one:

1. Does the monorepo folder structure match what CLAUDE.md describes?
   List what exists and what's missing.

2. Does a bun workspace package.json exist at the root?
   Show me its contents.

3. Do the slash command files exist in .claude/commands/?
   List them.

4. Do the hook scripts exist in .claude/hooks/?
   List them and check they're executable.

5. Does ~/.claude/config.json exist with MCP server configuration?
   Show me its contents (redact any tokens).

6. Run: bun install
   Report any errors.

7. Run: bun typecheck
   Report any errors.

For each check: status (OK / MISSING / BROKEN), what you found, and what needs fixing.
Do not fix anything yet — just report.
```

Review the report. Then paste this:

→ CLAUDE CODE:
```
Fix everything you marked as MISSING or BROKEN in your report.
After each fix, tell me what you did.
When all fixes are done, re-run all 7 checks and confirm everything is OK.
```

---

## PHASE 1 — Bootstrap the package structure

This creates all the package.json files, tsconfig files, and
entry points for every workspace package. Nothing is implemented yet —
just the correct skeleton that subsequent phases build on.

→ CLAUDE CODE:
```
Read CLAUDE.md. I need you to bootstrap the full monorepo package structure.

For each of these packages, create:
- packages/schema
- packages/agents
- packages/prompts
- packages/evaluators
- apps/api
- apps/web

Each package needs:
1. package.json with correct name (@forge/schema, @forge/agents, etc.),
   bun as runtime, TypeScript as dev dependency, and a build/test/typecheck script
2. tsconfig.json extending a root tsconfig.base.json (create that too)
   with strict: true, no any, paths configured for workspace aliases
3. src/index.ts that exports nothing yet — just a comment: "// exports added as modules are built"

Also create:
- .env.example at the root with these variables:
  ANTHROPIC_API_KEY=
  SUPABASE_URL=
  SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  NODE_ENV=development

After creating everything, run: bun install && bun typecheck
Fix any errors before reporting back.
```

---

## PHASE 2 — Discovery Document schema

This is the most critical file in the project. Use the schema we already designed.

Copy the file `discovery-document.schema.ts` (from the artifact I gave you)
into the forge folder. Then paste this into Claude Code:

→ CLAUDE CODE:
```
Read CLAUDE.md.

I have placed the Discovery Document schema file in the forge root folder.
Its filename is discovery-document.schema.ts

Do the following:
1. Move it to packages/schema/src/discovery-document.ts
2. Install zod in packages/schema: bun add zod
3. Make sure packages/schema/src/index.ts exports everything from discovery-document.ts
4. Run bun typecheck from the repo root — fix any type errors
5. Write a test file at packages/schema/src/discovery-document.test.ts

The test file must cover:
- parseDiscoveryDocument throws on invalid input (missing required fields)
- safeParseDiscoveryDocument returns success: false with a readable error message
- validateReadyForSystem2 blocks when status is not 'approved'
- validateReadyForSystem2 blocks when overall_confidence < 0.7
- validateReadyForSystem2 blocks when there are unresolved blocking questions
- validateReadyForSystem2 blocks when there are unresolved blocking flags
- validateReadyForSystem2 returns ready: true when all conditions are met
- computeRiskScore returns 5 for critical + very_likely
- computeRiskScore returns 1 for low + unlikely
- extractAssumedFields returns all paths where assumed === true
- createNewVersion throws if document is not sealed
- createNewVersion increments the version number
- getDocumentHealth returns 'critical' when blockerCount > 0

Run the tests: bun test packages/schema
All tests must pass before you report back.
```

---

## PHASE 3 — Prompt infrastructure

All LLM system prompts live in packages/prompts. Never inline in agent code.

→ CLAUDE CODE:
```
Read CLAUDE.md.

Create the prompt infrastructure in packages/prompts.

1. Create packages/prompts/src/types.ts with:

   export type PromptVariable = string | number | boolean
   export type PromptVariables = Record<string, PromptVariable>

   export interface PromptTemplate<T extends PromptVariables = PromptVariables> {
     name: string           // unique identifier, e.g. "explorer/clarifier"
     version: string        // semver, e.g. "1.0.0"
     description: string    // what this prompt does
     variables: (keyof T)[] // list of variable names this prompt expects
     render: (vars: T) => string  // returns the rendered system prompt
   }

2. Install: bun add zod (in packages/prompts)

3. Create packages/prompts/src/explorer/clarifier.ts

   This is the system prompt for the Clarifier Agent — the first agent in
   the Explorer pipeline. Its job is to:
   - Receive a raw problem statement from the user
   - Ask up to 5 targeted clarifying questions to resolve ambiguity
   - Never ask for information that can be reasonably inferred
   - Produce a structured clarification result: the refined problem statement
     plus a list of confirmed answers

   The prompt template takes these variables:
   - problem_statement: string  (the raw input from the user)
   - max_questions: number      (default 5)
   - project_type_hint: string  (optional hint about system type)

   The prompt must:
   - Assign the agent a clear identity and single responsibility
   - Explain exactly what output format is expected (JSON)
   - Include the ASSUMPTION_DISCIPLINE_PROMPT constant from @forge/schema
   - Tell the agent to set confidence scores
   - Tell the agent to emit agent_flags if confidence < 0.6
   - Include 2 example question/answer pairs as few-shot examples
   - Specify that questions must be open-ended, not yes/no

4. Create packages/prompts/src/explorer/decomposer.ts

   This is the Decomposer Agent prompt. Its job is to:
   - Receive the clarified problem statement
   - Map it across 5 dimensions:
     * Business: what value does this create, for whom
     * System: what are the major components and how do they interact
     * Technical: what are the key technical challenges
     * User: who are the users and what are their jobs-to-be-done
     * Constraints: what are the real-world limits
   - Produce a structured decomposition of the problem

   Variables: clarified_problem: string, existing_systems: string

5. Export everything from packages/prompts/src/index.ts

6. Run bun typecheck — fix all errors before reporting back.
```

---

## PHASE 4 — Agent state and LangGraph graph

→ CLAUDE CODE:
```
Read CLAUDE.md.

Install LangGraph in packages/agents:
  bun add @langchain/langgraph @langchain/anthropic @langchain/core zod

Create the Explorer pipeline as a LangGraph StateGraph.

1. Create packages/agents/src/types.ts

   Define ExplorerState — the shared state object that flows through
   all 5 Explorer nodes. It must contain:

   - input: the original problem statement string
   - clarification_result: output of Clarifier node (nullable until run)
   - decomposition: output of Decomposer node (nullable until run)
   - research: output of Research node (nullable until run)
   - requirements: output of Requirements node (nullable until run)
   - discovery_document: the final assembled DiscoveryDocument (nullable until synthesis)
   - current_node: which agent is currently running (for UI streaming)
   - agent_flags: AgentFlag[] accumulated across all nodes
   - errors: string[] any errors that occurred
   - human_feedback: optional string the user can inject at any checkpoint

   Import AgentFlag and DiscoveryDocument from @forge/schema.
   Use Zod to validate state shape.

2. Create packages/agents/src/explorer/nodes/clarifier.ts

   Implement the Clarifier node function:
   - Import the clarifier prompt from @forge/prompts
   - Call Claude claude-sonnet-4-5 (structured output mode)
   - Define a Zod output schema for the clarifier result:
     {
       refined_problem_statement: string
       clarifying_questions: Array<{ question: string, answer: string }>
       confidence: number  // 0-1
       agent_flags: AgentFlag[]
     }
   - If confidence < 0.6, push a flag to agent_flags with severity: 'warning'
   - If confidence < 0.4, push a flag with severity: 'blocking'
   - Return updated ExplorerState
   - Wrap the entire node in try/catch — on error, push to state.errors and return state

3. Create packages/agents/src/explorer/nodes/decomposer.ts

   Same pattern as clarifier but for the Decomposer.
   Input: state.clarification_result.refined_problem_statement
   Output schema:
   {
     business_dimension: string
     system_dimension: string
     technical_dimension: string
     user_dimension: string
     constraints_dimension: string
     confidence: number
     agent_flags: AgentFlag[]
   }

4. Create packages/agents/src/explorer/graph.ts

   Wire the StateGraph:
   - Nodes: clarifier → decomposer → (research → requirements → synthesis stubs)
   - For research, requirements, and synthesis: create stub nodes that
     just log "not yet implemented" and pass state through unchanged
   - Add a conditional edge after clarifier:
     if any flag has severity: 'blocking', route to END
     otherwise continue to decomposer
   - Compile and export the graph

5. Create packages/agents/src/explorer/index.ts
   Export: { explorerGraph } and all node types

6. Run bun typecheck — fix all errors.
   Run bun test packages/agents — stubs should pass trivially.
```

---

## PHASE 5 — API server

→ CLAUDE CODE:
```
Read CLAUDE.md.

Set up the Hono API server in apps/api.

Dependencies:
  bun add hono @hono/node-server zod
  bun add -d @types/node

1. Create apps/api/src/index.ts — the Hono app entry point
   - Import and mount all route files
   - Add global error handler that returns RFC 7807 Problem Detail JSON
   - Add request logging middleware (structured: method, path, status, duration_ms)
   - Start server on PORT from env (default 3001)

2. Create apps/api/src/routes/projects.ts
   Routes:
   - POST /api/projects
     Body: { name: string, problem_statement: string }
     Validates with Zod. Returns: { project_id: string, status: 'created' }
     Does NOT call any agents yet — just persists the project

   - GET /api/projects/:id
     Returns project metadata and current status

   - POST /api/projects/:id/explore
     Triggers System 1 (Explorer pipeline) for this project
     Returns immediately with: { job_id: string, status: 'running' }
     Runs the explorer graph in the background
     Streams progress via SSE on GET /api/projects/:id/explore/stream

   - GET /api/projects/:id/explore/stream
     SSE endpoint — emits events as each agent node completes:
     { event: 'node_complete', node: 'clarifier', data: { confidence, flags } }
     { event: 'node_complete', node: 'decomposer', data: { confidence, flags } }
     { event: 'checkpoint', type: 'A', message: 'Ready for human review' }
     { event: 'complete', discovery_document: DiscoveryDocument }
     { event: 'error', message: string }

   - GET /api/projects/:id/discovery
     Returns the sealed or latest DiscoveryDocument for this project

   - POST /api/projects/:id/discovery/approve
     Sets discovery document status to 'approved'

3. Create apps/api/src/lib/supabase.ts
   - Create and export the Supabase client using env vars
   - Export a typed helper: getClient() → SupabaseClient

4. Create apps/api/src/lib/errors.ts
   - Define AppError class extending Error with: statusCode, code, details
   - Define a toRFC7807 helper that formats it as Problem Detail

5. Add a dev script to apps/api/package.json: "dev": "bun run --watch src/index.ts"

6. Run: bun run dev (from apps/api)
   Confirm the server starts. Test with:
     curl -X POST http://localhost:3001/api/projects \
       -H "Content-Type: application/json" \
       -d '{"name":"test","problem_statement":"test problem"}'
   It will fail on DB (no Supabase yet) — that's fine.
   Confirm it returns a structured error, not a crash.
```

---

## PHASE 6 — Database (Supabase)

Do this step manually — create a project at supabase.com, copy the URL
and keys into .env, then run this:

→ CLAUDE CODE:
```
Read CLAUDE.md.

Create the Supabase database schema for Forge.

Write migration SQL files in supabase/migrations/.
File naming: 001_initial.sql, 002_discovery_documents.sql, etc.

Tables needed:

1. projects
   - id: uuid primary key default gen_random_uuid()
   - name: text not null
   - slug: text not null unique
   - owner_id: text not null  (auth.users reference, or just a string for now)
   - status: text not null default 'created'
     check: created | exploring | explored | designing | designed | building | built
   - created_at: timestamptz default now()
   - updated_at: timestamptz default now()

2. discovery_documents
   - id: uuid primary key default gen_random_uuid()
   - project_id: uuid references projects(id) on delete cascade
   - version: integer not null default 1
   - status: text not null default 'draft'
     check: draft | pending_review | approved | sealed | superseded
   - document: jsonb not null  -- the full DiscoveryDocument JSON
   - overall_confidence: float
   - has_blockers: boolean default true
   - created_at: timestamptz default now()
   - sealed_at: timestamptz
   - unique(project_id, version)

3. agent_runs
   - id: uuid primary key default gen_random_uuid()
   - project_id: uuid references projects(id)
   - discovery_document_id: uuid references discovery_documents(id)
   - agent_name: text not null  -- 'clarifier' | 'decomposer' | etc.
   - status: text not null default 'running'  -- running | complete | failed
   - input: jsonb
   - output: jsonb
   - confidence: float
   - flags: jsonb default '[]'
   - error: text
   - started_at: timestamptz default now()
   - completed_at: timestamptz

Enable Row Level Security on all tables.
Add a basic RLS policy: owner_id = auth.uid() for projects,
and cascade access to discovery_documents and agent_runs via project ownership.

Also create these indexes:
- projects(owner_id)
- projects(slug)
- discovery_documents(project_id, version)
- agent_runs(project_id, status)

After writing the migration files, also:
1. Update apps/api/src/lib/supabase.ts with correct TypeScript types
   derived from these tables (use Supabase's generated types pattern)
2. Wire the POST /api/projects route to actually INSERT into the projects table
3. Wire POST /api/projects/:id/explore to INSERT into agent_runs as each node runs
4. Wire GET /api/projects/:id/discovery to SELECT from discovery_documents

Run bun typecheck. Fix all errors.
```

---

## PHASE 7 — Complete the Explorer agents (Research + Requirements + Synthesis)

→ CLAUDE CODE:
```
Read CLAUDE.md.

The Clarifier and Decomposer agents are implemented.
Now implement the remaining 3 Explorer agents.

For each agent, follow the same pattern:
- Prompt in packages/prompts/src/explorer/[name].ts
- Node in packages/agents/src/explorer/nodes/[name].ts
- Both must follow the Zod output schema pattern from clarifier and decomposer

--- Research Agent ---

Purpose: Given the decomposition, research the problem space.
Output schema:
{
  alternatives_considered: AlternativeApproach[]
  relevant_patterns: TechnicalPattern[]
  known_pitfalls: KnownPitfall[]
  prior_art: PriorArt[]
  confidence: number
  agent_flags: AgentFlag[]
}

The prompt must instruct the agent to:
- Think about what existing tools/frameworks solve parts of this problem
- Identify at least 3 known failure modes for this type of system
- Recommend at least 2 technical patterns that apply
- Be honest about uncertainty — flag anything it cannot verify

--- Requirements Agent ---

Purpose: Convert decomposition + research into structured requirements.
Output schema:
{
  functional: FunctionalRequirement[]
  non_functional: NonFunctionalRequirement[]
  scale_profile: ScaleProfile
  confidence: number
  agent_flags: AgentFlag[]
}

The prompt must instruct the agent to:
- Generate at minimum 5 functional requirements with MoSCoW priorities
- Generate at minimum 4 non-functional requirements (performance, security,
  availability, observability are mandatory)
- Produce a scale_profile where most fields will be assumed: true
  with realistic estimates for the described problem
- Set inferred: true on requirements it generated vs ones explicitly stated

--- Synthesis Agent ---

Purpose: Assemble all prior agent outputs into a complete DiscoveryDocument.
This is the most important agent. It must produce a valid DiscoveryDocument
that passes safeParseDiscoveryDocument from @forge/schema.

Output: a complete DiscoveryDocument JSON object.

The prompt must instruct the agent to:
- Assemble all sections from prior agent outputs
- Fill metadata fields (generate a uuid for id, set version: 1, status: 'draft')
- Compute overall_confidence as the weighted average of all agent confidences
- Set has_blockers: true if any flags have severity: 'blocking'
- Write an inline rationale for every major section
- Log every significant inference as a decision in decisions_log
- Output ONLY valid JSON — no markdown fences, no commentary

After the Synthesis node runs, validate the output with safeParseDiscoveryDocument.
If validation fails, push a blocking flag and do not proceed.

--- Wire everything ---

Update packages/agents/src/explorer/graph.ts:
Replace the stub nodes with real implementations.
Full graph: clarifier → decomposer → research → requirements → synthesis
The conditional edge logic:
- After ANY node: if blocking flags exist, route to a 'checkpoint' node
  that sets current_node: 'awaiting_human' and returns to END
- Otherwise continue to next node

Update packages/agents/src/explorer/index.ts to export the complete graph.

Run bun typecheck && bun test packages/agents
All tests must pass.
```

---

## PHASE 8 — Connect agents to API (end-to-end)

→ CLAUDE CODE:
```
Read CLAUDE.md.

The Explorer agent graph is complete. Now wire it into the API so the
full pipeline runs when POST /api/projects/:id/explore is called.

Update apps/api/src/routes/projects.ts:

The POST /api/projects/:id/explore route must:
1. Load the project from Supabase
2. Create a new discovery_documents row with status: 'draft'
3. Invoke the explorerGraph with the project's problem_statement
4. As each node completes, update the agent_runs table
5. When synthesis completes, save the DiscoveryDocument to discovery_documents
6. Call validateReadyForSystem2 — if blockers exist, set status: 'pending_review'
   otherwise set status: 'approved'

The SSE stream endpoint must:
- Subscribe to the agent graph's event stream (LangGraph supports this)
- Emit a server-sent event for each node completion
- Format: data: { event, node, confidence, flags, partial_state }
- On completion, emit the full DiscoveryDocument and close the stream
- On error, emit an error event and close cleanly

After implementing, do an end-to-end test:
1. Start the API: bun dev (from apps/api)
2. Create a project:
   curl -X POST http://localhost:3001/api/projects \
     -H "Content-Type: application/json" \
     -d '{"name":"forge-test","problem_statement":"I want to build a system that takes a problem statement and produces a complete technical design document with architecture decisions, data models, and API contracts."}'
3. Run the explorer:
   curl -X POST http://localhost:3001/api/projects/{id}/explore
4. Stream the output:
   curl -N http://localhost:3001/api/projects/{id}/explore/stream

Report the full stream output back to me.
If anything fails, debug it using the /debug slash command pattern.
```

---

## PHASE 9 — Frontend (the UI you'll actually use)

→ CLAUDE CODE:
```
Read CLAUDE.md.

Set up the Next.js frontend in apps/web.

Dependencies:
  bunx create-next-app@latest apps/web --typescript --tailwind --app --no-src-dir --import-alias "@/*"
  cd apps/web && bun add @forge/schema
  bunx shadcn@latest init (accept defaults, use slate base color)

Install these ShadCN components:
  bunx shadcn@latest add button card badge textarea input progress separator
  bunx shadcn@latest add alert dialog sheet tabs

Then create these pages and components:

1. app/page.tsx — landing/home
   - Single centered textarea: "Describe your project idea..."
   - A "Start Discovery" button
   - Below: a list of recent projects with their status badges
   - On submit: POST /api/projects then redirect to /projects/[id]

2. app/projects/[id]/page.tsx — project dashboard
   - Project name and status at the top
   - Tab navigation: Discovery | Design | Code (Design and Code disabled for now)
   - The Discovery tab shows the ExplorerView component

3. components/explorer/ExplorerView.tsx
   - Shows 5 agent nodes in a vertical pipeline (Clarifier, Decomposer,
     Research, Requirements, Synthesis)
   - Each node has: name, status (idle/running/complete/flagged), confidence bar
   - When the pipeline is running, connects to the SSE stream and
     animates each node as it completes
   - When complete, shows a "View Discovery Document" button

4. components/explorer/DiscoveryDocumentView.tsx
   - Renders a DiscoveryDocument in readable form
   - Sections: Problem, Context, Goals, Scale Profile, Business Model,
     Requirements, Risks, Open Questions & Flags
   - Flag items shown prominently with severity colour coding
   - "Approve for Design" button — calls POST /api/projects/:id/discovery/approve
   - Disabled if has_blockers is true, with tooltip explaining why

5. Create an API client in lib/api.ts
   All fetch calls go through this. Typed request/response.
   Never use fetch() directly in components.

Style rules:
- ShadCN components only — no custom UI primitives
- Tailwind for all styling
- Server Components by default, 'use client' only where needed
- Loading states on every async component using Suspense

After building, run: bun dev (from apps/web)
Confirm the home page loads and the textarea/button render correctly.
```

---

## PHASE 10 — End-to-end smoke test

Once phases 1–9 are done, paste this final prompt:

→ CLAUDE CODE:
```
Run a complete end-to-end smoke test of the Forge System 1 pipeline.

Start both servers:
- apps/api on port 3001
- apps/web on port 3000

Then walk through this user journey and report the result at each step:

Step 1: Open http://localhost:3000
  Expected: home page loads with textarea and button

Step 2: Submit this problem statement via the UI or API:
  "I want to build a tool for software engineers that takes a rough project
   idea and automatically produces a technical spec, architecture diagram,
   and initial codebase scaffold. The engineer should be able to go from
   idea to running code in under an hour."

Step 3: Watch the Explorer pipeline run
  Expected: 5 agents run sequentially, each emitting SSE events
  Report: which agents ran, confidence scores, any flags raised

Step 4: View the Discovery Document
  Expected: a complete DiscoveryDocument with all required sections populated
  Report: overall_confidence score, number of assumed fields, number of flags

Step 5: Check the database
  Expected: a projects row, a discovery_documents row with valid JSON
  Report: confirm both exist

Step 6: Attempt to approve
  Expected: if has_blockers is false, approval succeeds and status → 'approved'
  Report: final document status

If any step fails:
1. Apply the /debug process to find the root cause
2. Fix it
3. Re-run from the failing step

When all 6 steps pass, report: "System 1 complete. Ready for System 2."
```

---

## What comes after System 1

Once the smoke test passes, the build order is:

System 2 (Designer):
- ArchitectAgent → produces high-level system design
- DataModelAgent → produces Supabase schema and ERDs
- APIContractAgent → produces OpenAPI spec
- SecurityAgent → threat model and auth design
- TechnicalDesignPackage (the System 1 → System 2 equivalent artifact)

System 3 (Builder):
- ScaffoldAgent → creates the project structure
- ImplementationAgent → writes core business logic
- TestAgent → generates test suites
- CIAgent → generates GitHub Actions workflows

Each system follows the same pattern you're building now.
The hard work is in System 1 — once you understand the pattern,
Systems 2 and 3 are variations on it.

---

## The rule for every future guide I give you

When I produce a guide, do this:

1. Save the guide as a .md file in your forge folder
2. Open Claude Code
3. Paste this:
   "Read [filename.md] and execute it section by section.
    After each section, tell me what you did and ask if I want to proceed."

That's it. You never manually create files again.