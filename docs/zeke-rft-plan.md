# ZEKE Reinforcement Fine-Tuning (RFT) System

This plan describes how to continuously improve ZEKE using OpenAI Reinforcement Fine-Tuning (RFT) so it adapts to Nate's evolving needs while maintaining safety and reliability.

## Objectives
- Increase task success and actionability for Nate's daily workflows (scheduling, messaging, ops, research).
- Reduce friction by personalizing responses to Nate's preferences and tone.
- Maintain safety through strong guardrails, human oversight, and automated evaluations.

## System Architecture
1. **Event Capture Layer** (Node/Python):
   - Instrument existing Conductor + specialist agents to log interactions, tool calls, and outcomes to a unified event stream (e.g., SQLite/Parquet + S3 bucket).
   - Standardize trace schema: `user_message`, `interpreted_intent` (what ZEKE thought the task was), `intended_outcome` (what success looks like), `observed_outcome` (what actually happened), `context`, `selected_tools`, `tool_args`, `tool_results`, `final_response`, `latency`, `flags` (safety/quality), and `conversation_id`.

2. **Data Refinement & Labeling** (Batch jobs):
   - Automated filters to drop low-signal or unsafe examples (PII leaks, hallucinations, incomplete tool runs).
   - Human-in-the-loop labeling UI (small panel) to score responses, note corrections, and mark preferred trajectories.
   - Decompose `score_card` into explicit dimensions: task completion, correctness, tone alignment, verbosity discipline, safety alignment, and tool discipline (called vs. should have called).
   - Capture a short free-text "would have preferred" field (e.g., "ask before booking"), stored alongside labels for reward model context.
   - Produce **(prompt, response, reward)** tuples plus richer `score_card` metadata (task category, complexity, safety notes) with labeler identity and timestamp.

3. **Reward Modeling**:
   - Start with a simple reward model (linear/shallow NN) focused on explicit penalties for unnecessary tool calls, partial executions, and premature confidence; prioritize task completion and tool correctness over tone.
   - Use offline evaluation sets covering core domains (communication, scheduling, ops, research, memory).
   - Continuously recalibrate with periodic spot-checks from Nate or trusted reviewers, and monthly audits for labeler drift.

4. **Policy Fine-Tuning via RFT**:
   - Use OpenAI RFT with task-specific system prompts for ZEKE.
   - Freeze constitutional components (safety system prompt, refusal logic, tool schemas, memory write/read patterns) and allow RFT to shape behavioral policy (decisioning, tool selection order, verbosity, phrasing).
   - Curriculum: start with safe, high-confidence data; gradually incorporate harder multi-step traces.
   - Hyperparameters to track: KL penalty, reward scaling, batch size, and episode length (tool call depth).
   - Maintain separate policies per modality if adding voice/SMS-specific behaviors.

5. **Evaluation & Guardrails**:
   - **Offline tests**: regression suites using deterministic inputs + expected responses; tool-call correctness checks; refusal tests for unsafe prompts.
   - **Online monitors**: real-time anomaly detection on latency, tool error rate, safety flags; auto-rollback if metrics degrade; track "unnecessary autonomy rate" (actions without permission or inferred intent overreach).
   - **Shadow/Canary deploys**: route small traffic % to candidate policy; compare win-rate vs. baseline via A/B and disagreement sampling; pin policy version per conversation to avoid mid-thread drift.

6. **Deployment Pipeline**:
   - CI job to package datasets, trigger RFT training, and archive artifacts (policy ID, config, eval metrics).
   - CD job to roll out new policy behind feature flag; includes automated smoke tests against `/api/agents/status` and scripted conversations; pin policy per conversation thread.
   - Explicit rollback path: revert feature flag + restore previous policy ID.

## Data Flow Details
1. **Collection**: agents emit structured traces → stored as daily partitions (e.g., `logs/yyyy-mm-dd/…`).
2. **Filtering**: nightly batch drops noisy traces (timeouts, tool failures) and removes secrets.
3. **Labeling**: reviewers score samples in UI; labels stored as `reward_events` table.
4. **Dataset Build**: cron job constructs RFT dataset with trajectories + rewards; saves manifest with dataset hash.
5. **Training**: pipeline calls OpenAI RFT API with manifest and reward model; logs training metrics to monitoring dashboard.
6. **Validation**: offline suite + spot manual review; only promote if win-rate and safety metrics improve.

## Safety & Compliance
- Enforce PII scrubbing before labeling/training; isolate secrets from payloads.
- Mandatory refusal patterns for unsafe tasks (finance, unauthorized access, data deletion) remain in system prompts during RFT; memory writes remain deterministic and out-of-band from RFT changes.
- Maintain audit trails: who labeled, when, and rationale; retain diffs between policy versions; schedule monthly audits for labeler bias/drift.

## Experiment Tracking
- Central registry (e.g., SQLite + lightweight dashboard) capturing: dataset hash, reward model version, policy ID, training config, eval scores, rollout dates, rollback reasons.
- Quick comparison views for “win-rate vs. baseline” and “safety incidents per 1k messages.”

## Next Steps (MVP)
1. Instrument Conductor + specialists to emit standardized traces with intent/outcome fields and rewards placeholders; store daily partitions.
2. Build nightly filter + dataset builder scripts (Python) writing manifests for RFT.
3. Create labeling UI for 30–50 samples/day and lock the decomposed `score_card` rubric (include "would have preferred" text).
4. Train a simple reward model and run a small RFT job on a single narrow domain (e.g., scheduling) using high-quality, low-risk data.
5. Ship via canary to 5–10% traffic; pin policy per conversation; monitor win-rate, safety metrics, and unnecessary autonomy rate; iterate.
