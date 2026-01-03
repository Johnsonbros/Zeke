# ZEKE Reinforcement Fine-Tuning (RFT) System

This plan describes how to continuously improve ZEKE using OpenAI Reinforcement Fine-Tuning (RFT) so it adapts to Nate's evolving needs while maintaining safety and reliability.

## Objectives
- Increase task success and actionability for Nate's daily workflows (scheduling, messaging, ops, research).
- Reduce friction by personalizing responses to Nate's preferences and tone.
- Maintain safety through strong guardrails, human oversight, and automated evaluations.

## System Architecture
1. **Event Capture Layer** (Node/Python):
   - Instrument existing Conductor + specialist agents to log interactions, tool calls, and outcomes to a unified event stream (e.g., SQLite/Parquet + S3 bucket).
   - Standardize trace schema: `user_message`, `context`, `selected_tools`, `tool_args`, `tool_results`, `final_response`, `latency`, `flags` (safety/quality), and `conversation_id`.

2. **Data Refinement & Labeling** (Batch jobs):
   - Automated filters to drop low-signal or unsafe examples (PII leaks, hallucinations, incomplete tool runs).
   - Human-in-the-loop labeling UI (small panel) to score responses, note corrections, and mark preferred trajectories.
   - Produce **(prompt, response, reward)** tuples plus richer `score_card` metadata (task category, complexity, safety notes).

3. **Reward Modeling**:
   - Train a lightweight reward model on `score_card` labels: success, helpfulness, tone alignment, safety.
   - Use offline evaluation sets covering core domains (communication, scheduling, ops, research, memory).
   - Continuously recalibrate with periodic spot-checks from Nate or trusted reviewers.

4. **Policy Fine-Tuning via RFT**:
   - Use OpenAI RFT with task-specific system prompts for ZEKE.
   - Curriculum: start with safe, high-confidence data; gradually incorporate harder multi-step traces.
   - Hyperparameters to track: KL penalty, reward scaling, batch size, and episode length (tool call depth).
   - Maintain separate policies per modality if adding voice/SMS-specific behaviors.

5. **Evaluation & Guardrails**:
   - **Offline tests**: regression suites using deterministic inputs + expected responses; tool-call correctness checks; refusal tests for unsafe prompts.
   - **Online monitors**: real-time anomaly detection on latency, tool error rate, safety flags; auto-rollback if metrics degrade.
   - **Shadow/Canary deploys**: route small traffic % to candidate policy; compare win-rate vs. baseline via A/B and disagreement sampling.

6. **Deployment Pipeline**:
   - CI job to package datasets, trigger RFT training, and archive artifacts (policy ID, config, eval metrics).
   - CD job to roll out new policy behind feature flag; includes automated smoke tests against `/api/agents/status` and scripted conversations.
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
- Mandatory refusal patterns for unsafe tasks (finance, unauthorized access, data deletion) remain in system prompts during RFT.
- Maintain audit trails: who labeled, when, and rationale; retain diffs between policy versions.

## Experiment Tracking
- Central registry (e.g., SQLite + lightweight dashboard) capturing: dataset hash, reward model version, policy ID, training config, eval scores, rollout dates, rollback reasons.
- Quick comparison views for “win-rate vs. baseline” and “safety incidents per 1k messages.”

## Next Steps (MVP)
1. Instrument Conductor + specialists to emit standardized traces with rewards placeholders.
2. Build nightly filter + dataset builder scripts (Python) writing manifests for RFT.
3. Create labeling UI for 30–50 samples/day and define the `score_card` rubric.
4. Train initial reward model and run small RFT job on high-quality, low-risk data.
5. Ship via canary to 5–10% traffic; monitor win-rate and safety metrics; iterate.
