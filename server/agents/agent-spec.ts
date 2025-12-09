/**
 * ZEKE Multi-Agent Architecture Specification
 * 
 * This module defines the intent schema and capability catalog for ZEKE's
 * multi-agent system. The architecture follows a conductor-specialist pattern
 * where a central Conductor agent routes requests to specialized agents based
 * on intent classification.
 * 
 * Architecture Overview:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                              CONDUCTOR                                   │
 * │         (Routes requests, manages handoffs, coordinates agents)         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *         ┌──────────────────────────┼──────────────────────────┐
 *         │                          │                          │
 *         ▼                          ▼                          ▼
 * ┌───────────────┐        ┌───────────────┐         ┌───────────────┐
 * │  CommsPilot   │        │  OpsPlanner   │         │ResearchScout  │
 * │ (SMS/Chat)    │        │ (Tasks/Cal)   │         │ (Search)      │
 * └───────────────┘        └───────────────┘         └───────────────┘
 *         │                          │                          │
 *         ▼                          ▼                          ▼
 * ┌───────────────┐        ┌───────────────┐         ┌───────────────┐
 * │MemoryCurator  │        │PersonalData   │         │ SafetyAuditor │
 * │ (Lifelogs)    │        │Steward (Files)│         │ (Guardrails)  │
 * └───────────────┘        └───────────────┘         └───────────────┘
 * 
 * @module agent-spec
 * @author ZEKE System
 * @version 1.0.0
 */

import type { ToolPermissions } from "../tools";

// ============================================================================
// CORE ENUMS (Must be defined first as they're referenced throughout)
// ============================================================================

/**
 * High-level capability categories
 */
export enum CapabilityCategory {
  COMMUNICATION = "communication",
  SCHEDULING = "scheduling",
  TASK_MANAGEMENT = "task_management",
  INFORMATION = "information",
  MEMORY = "memory",
  GROCERY = "grocery",
  PROFILE = "profile",
  SYSTEM = "system",
}

/**
 * Unique identifiers for each agent in the system
 */
export enum AgentId {
  CONDUCTOR = "conductor",
  MEMORY_CURATOR = "memory_curator",
  COMMS_PILOT = "comms_pilot",
  OPS_PLANNER = "ops_planner",
  RESEARCH_SCOUT = "research_scout",
  PERSONAL_DATA_STEWARD = "personal_data_steward",
  SAFETY_AUDITOR = "safety_auditor",
}

/**
 * Current operational state of an agent
 */
export enum AgentStatus {
  IDLE = "idle",
  PROCESSING = "processing",
  WAITING_FOR_HANDOFF = "waiting_for_handoff",
  ERROR = "error",
}

// ============================================================================
// AGENT DEFINITIONS
// ============================================================================

/**
 * Base interface for all agents in the system
 */
export interface AgentDefinition {
  /** Unique identifier for the agent */
  id: AgentId;
  /** Human-readable name */
  name: string;
  /** Description of the agent's responsibilities */
  description: string;
  /** List of capability categories this agent owns */
  capabilities: CapabilityCategory[];
  /** Tools this agent can use directly */
  tools: string[];
  /** Whether this agent can initiate handoffs */
  canInitiateHandoff: boolean;
  /** Agents this agent can hand off to */
  handoffTargets: AgentId[];
  /** System prompt template for the agent */
  systemPrompt: string;
}

/**
 * Conductor Agent Definition
 * 
 * The Conductor is the entry point for all user interactions. It:
 * - Classifies user intent
 * - Routes requests to appropriate specialist agents
 * - Manages multi-agent workflows
 * - Synthesizes responses from multiple agents
 * - Handles fallback logic when specialists fail
 */
export const ConductorAgent: AgentDefinition = {
  id: AgentId.CONDUCTOR,
  name: "Conductor",
  description: "Central orchestrator that routes requests to appropriate specialists, manages handoffs, and synthesizes multi-agent responses",
  capabilities: [], // Conductor delegates, doesn't own capabilities directly
  tools: [], // Conductor uses other agents, not tools directly
  canInitiateHandoff: true,
  handoffTargets: [
    AgentId.MEMORY_CURATOR,
    AgentId.COMMS_PILOT,
    AgentId.OPS_PLANNER,
    AgentId.RESEARCH_SCOUT,
    AgentId.PERSONAL_DATA_STEWARD,
    AgentId.SAFETY_AUDITOR,
  ],
  systemPrompt: `You are ZEKE's Conductor agent. Your role is to:
1. Analyze incoming user requests to determine intent
2. Route requests to the appropriate specialist agent(s)
3. Coordinate multi-agent workflows when needed
4. Synthesize responses from multiple agents
5. Ensure smooth handoffs between agents
6. Handle errors gracefully with fallback strategies

Never perform tasks directly - always delegate to specialists.`,
};

/**
 * MemoryCurator Agent Definition
 * 
 * Specializes in memory retrieval and synthesis:
 * - Semantic memory search
 * - Omi lifelog queries and synthesis
 * - Conversation history recall
 * - Context-aware memory retrieval
 */
export const MemoryCuratorAgent: AgentDefinition = {
  id: AgentId.MEMORY_CURATOR,
  name: "MemoryCurator",
  description: "Retrieves and synthesizes semantic memories, Omi lifelogs, and historical context",
  capabilities: [CapabilityCategory.MEMORY],
  tools: [
    "search_lifelogs",
    "get_recent_lifelogs",
    "get_lifelog_context",
    "check_omi_status",
  ],
  canInitiateHandoff: true,
  handoffTargets: [AgentId.CONDUCTOR, AgentId.PERSONAL_DATA_STEWARD],
  systemPrompt: `You are ZEKE's MemoryCurator agent. Your role is to:
1. Search through Omi pendant recordings and lifelogs
2. Retrieve relevant semantic memories based on context
3. Synthesize conversation excerpts into coherent summaries
4. Find historical context for user queries
5. Surface relevant past interactions and facts

Always respect privacy and only access memories the user is authorized to view.`,
};

/**
 * CommsPilot Agent Definition
 * 
 * Handles all communication operations:
 * - SMS sending and receiving
 * - Daily check-in management
 * - Contact permission enforcement
 * - Message formatting and delivery
 */
export const CommsPilotAgent: AgentDefinition = {
  id: AgentId.COMMS_PILOT,
  name: "CommsPilot",
  description: "Handles SMS/chat communications, respects contact permissions, manages check-ins",
  capabilities: [CapabilityCategory.COMMUNICATION],
  tools: [
    "send_sms",
    "configure_daily_checkin",
    "get_daily_checkin_status",
    "stop_daily_checkin",
    "send_checkin_now",
  ],
  canInitiateHandoff: true,
  handoffTargets: [AgentId.CONDUCTOR, AgentId.SAFETY_AUDITOR],
  systemPrompt: `You are ZEKE's CommsPilot agent. Your role is to:
1. Send SMS messages when authorized
2. Manage daily check-in configurations
3. Enforce contact permission rules
4. Format messages appropriately for the medium
5. Verify sender has permission before sending

CRITICAL: Always verify permissions before sending messages.
Only master admins and authorized contacts can trigger outbound SMS.`,
};

/**
 * OpsPlanner Agent Definition
 * 
 * Manages operational tools and scheduling:
 * - Tasks (CRUD operations)
 * - Reminders (scheduling, notifications)
 * - Calendar integration
 * - Grocery list management
 * - Time and weather utilities
 */
export const OpsPlannerAgent: AgentDefinition = {
  id: AgentId.OPS_PLANNER,
  name: "OpsPlanner",
  description: "Manages tasks, reminders, calendar events, grocery lists, and operational utilities",
  capabilities: [
    CapabilityCategory.SCHEDULING,
    CapabilityCategory.TASK_MANAGEMENT,
    CapabilityCategory.GROCERY,
  ],
  tools: [
    // Task tools
    "add_task",
    "list_tasks",
    "update_task",
    "complete_task",
    "delete_task",
    "clear_completed_tasks",
    // Reminder tools
    "set_reminder",
    "list_reminders",
    "cancel_reminder",
    // Calendar tools
    "get_calendar_events",
    "get_today_events",
    "get_upcoming_events",
    "create_calendar_event",
    "update_calendar_event",
    "delete_calendar_event",
    // Grocery tools
    "add_grocery_item",
    "list_grocery_items",
    "mark_grocery_purchased",
    "remove_grocery_item",
    "clear_purchased_groceries",
    "clear_all_groceries",
    // Utility tools
    "get_current_time",
    "get_weather",
  ],
  canInitiateHandoff: true,
  handoffTargets: [AgentId.CONDUCTOR, AgentId.MEMORY_CURATOR],
  systemPrompt: `You are ZEKE's OpsPlanner agent. Your role is to:
1. Create, update, and manage tasks with priorities and due dates
2. Set and manage reminders with flexible scheduling
3. Query and create calendar events
4. Manage the shared grocery list
5. Provide time and weather information

Use natural language to confirm operations and provide helpful summaries.`,
};

/**
 * ResearchScout Agent Definition
 * 
 * Handles information gathering and research:
 * - Web searches (DuckDuckGo)
 * - AI-powered research (Perplexity)
 * - Current events and news
 * - Fact verification
 */
export const ResearchScoutAgent: AgentDefinition = {
  id: AgentId.RESEARCH_SCOUT,
  name: "ResearchScout",
  description: "Performs web searches, Perplexity queries, and information gathering",
  capabilities: [CapabilityCategory.INFORMATION],
  tools: [
    "web_search",
    "perplexity_search",
  ],
  canInitiateHandoff: true,
  handoffTargets: [AgentId.CONDUCTOR, AgentId.MEMORY_CURATOR],
  systemPrompt: `You are ZEKE's ResearchScout agent. Your role is to:
1. Perform web searches for factual information
2. Use Perplexity for complex research questions
3. Find current events and news
4. Verify facts and provide sources
5. Synthesize search results into coherent answers

Prefer Perplexity for complex questions. Fall back to web search if needed.
Always cite sources when available.`,
};

/**
 * PersonalDataSteward Agent Definition
 * 
 * Manages personal profile and data:
 * - Profile information
 * - User preferences
 * - Known facts and notes
 * - File operations
 */
export const PersonalDataStewardAgent: AgentDefinition = {
  id: AgentId.PERSONAL_DATA_STEWARD,
  name: "PersonalDataSteward",
  description: "Manages profile data, preferences, known facts, and file operations",
  capabilities: [CapabilityCategory.PROFILE],
  tools: [
    "read_file",
    "write_file",
    "list_files",
  ],
  canInitiateHandoff: true,
  handoffTargets: [AgentId.CONDUCTOR, AgentId.MEMORY_CURATOR],
  systemPrompt: `You are ZEKE's PersonalDataSteward agent. Your role is to:
1. Access and update user profile information
2. Manage user preferences
3. Store and retrieve known facts
4. Handle file operations safely
5. Maintain data consistency

Only access files in authorized directories (notes/, data/).
Protect sensitive personal information.`,
};

/**
 * SafetyAuditor Agent Definition
 * 
 * Handles security and safety:
 * - Permission verification
 * - Response validation
 * - Guardrail enforcement
 * - Audit logging
 */
export const SafetyAuditorAgent: AgentDefinition = {
  id: AgentId.SAFETY_AUDITOR,
  name: "SafetyAuditor",
  description: "Performs permission checks, response validation, and guardrail enforcement",
  capabilities: [CapabilityCategory.SYSTEM],
  tools: [], // Safety auditor reviews, doesn't use tools directly
  canInitiateHandoff: true,
  handoffTargets: [AgentId.CONDUCTOR],
  systemPrompt: `You are ZEKE's SafetyAuditor agent. Your role is to:
1. Verify user permissions before operations
2. Validate responses for safety and appropriateness
3. Enforce access control rules
4. Log security-relevant events
5. Block unauthorized actions

Be vigilant but not obstructive. Security should be seamless for authorized users.`,
};

/**
 * Complete registry of all agents
 */
export const AGENT_REGISTRY: Record<AgentId, AgentDefinition> = {
  [AgentId.CONDUCTOR]: ConductorAgent,
  [AgentId.MEMORY_CURATOR]: MemoryCuratorAgent,
  [AgentId.COMMS_PILOT]: CommsPilotAgent,
  [AgentId.OPS_PLANNER]: OpsPlannerAgent,
  [AgentId.RESEARCH_SCOUT]: ResearchScoutAgent,
  [AgentId.PERSONAL_DATA_STEWARD]: PersonalDataStewardAgent,
  [AgentId.SAFETY_AUDITOR]: SafetyAuditorAgent,
};

// ============================================================================
// INTENT CATEGORIES
// ============================================================================

/**
 * Specific intent types within each category
 */
export enum IntentType {
  // Communication intents
  SEND_MESSAGE = "send_message",
  CHECK_IN = "check_in",
  CONTACT_LOOKUP = "contact_lookup",
  CONFIGURE_CHECKIN = "configure_checkin",

  // Scheduling intents
  CALENDAR_QUERY = "calendar_query",
  CREATE_EVENT = "create_event",
  UPDATE_EVENT = "update_event",
  DELETE_EVENT = "delete_event",
  SET_REMINDER = "set_reminder",
  CANCEL_REMINDER = "cancel_reminder",

  // Task management intents
  ADD_TASK = "add_task",
  UPDATE_TASK = "update_task",
  COMPLETE_TASK = "complete_task",
  DELETE_TASK = "delete_task",
  VIEW_TASKS = "view_tasks",

  // Information intents
  SEARCH = "search",
  RESEARCH = "research",
  WEATHER = "weather",
  TIME = "time",

  // Memory intents
  RECALL_FACT = "recall_fact",
  SEARCH_HISTORY = "search_history",
  LIFELOG_QUERY = "lifelog_query",
  SAVE_MEMORY = "save_memory",

  // Grocery intents
  ADD_ITEM = "add_item",
  CHECK_LIST = "check_list",
  MARK_PURCHASED = "mark_purchased",
  REMOVE_ITEM = "remove_item",
  CLEAR_LIST = "clear_list",

  // Profile intents
  PREFERENCE_UPDATE = "preference_update",
  PROFILE_QUERY = "profile_query",
  READ_FILE = "read_file",
  WRITE_FILE = "write_file",

  // System intents
  MORNING_BRIEFING = "morning_briefing",
  STATUS_CHECK = "status_check",
  HELP = "help",
  UNKNOWN = "unknown",
}

/**
 * Schema for a classified intent
 */
export interface ClassifiedIntent {
  /** The detected intent category */
  category: CapabilityCategory;
  /** Specific intent type */
  type: IntentType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extracted entities from the request */
  entities: Record<string, unknown>;
  /** Original user message */
  rawMessage: string;
  /** Whether this requires multi-agent coordination */
  requiresCoordination: boolean;
  /** Agents needed to fulfill this request */
  targetAgents: AgentId[];
}

/**
 * Maps intent types to their parent categories
 */
export const INTENT_TO_CATEGORY: Record<IntentType, CapabilityCategory> = {
  // Communication
  [IntentType.SEND_MESSAGE]: CapabilityCategory.COMMUNICATION,
  [IntentType.CHECK_IN]: CapabilityCategory.COMMUNICATION,
  [IntentType.CONTACT_LOOKUP]: CapabilityCategory.COMMUNICATION,
  [IntentType.CONFIGURE_CHECKIN]: CapabilityCategory.COMMUNICATION,

  // Scheduling
  [IntentType.CALENDAR_QUERY]: CapabilityCategory.SCHEDULING,
  [IntentType.CREATE_EVENT]: CapabilityCategory.SCHEDULING,
  [IntentType.UPDATE_EVENT]: CapabilityCategory.SCHEDULING,
  [IntentType.DELETE_EVENT]: CapabilityCategory.SCHEDULING,
  [IntentType.SET_REMINDER]: CapabilityCategory.SCHEDULING,
  [IntentType.CANCEL_REMINDER]: CapabilityCategory.SCHEDULING,

  // Task management
  [IntentType.ADD_TASK]: CapabilityCategory.TASK_MANAGEMENT,
  [IntentType.UPDATE_TASK]: CapabilityCategory.TASK_MANAGEMENT,
  [IntentType.COMPLETE_TASK]: CapabilityCategory.TASK_MANAGEMENT,
  [IntentType.DELETE_TASK]: CapabilityCategory.TASK_MANAGEMENT,
  [IntentType.VIEW_TASKS]: CapabilityCategory.TASK_MANAGEMENT,

  // Information
  [IntentType.SEARCH]: CapabilityCategory.INFORMATION,
  [IntentType.RESEARCH]: CapabilityCategory.INFORMATION,
  [IntentType.WEATHER]: CapabilityCategory.INFORMATION,
  [IntentType.TIME]: CapabilityCategory.INFORMATION,

  // Memory
  [IntentType.RECALL_FACT]: CapabilityCategory.MEMORY,
  [IntentType.SEARCH_HISTORY]: CapabilityCategory.MEMORY,
  [IntentType.LIFELOG_QUERY]: CapabilityCategory.MEMORY,
  [IntentType.SAVE_MEMORY]: CapabilityCategory.MEMORY,

  // Grocery
  [IntentType.ADD_ITEM]: CapabilityCategory.GROCERY,
  [IntentType.CHECK_LIST]: CapabilityCategory.GROCERY,
  [IntentType.MARK_PURCHASED]: CapabilityCategory.GROCERY,
  [IntentType.REMOVE_ITEM]: CapabilityCategory.GROCERY,
  [IntentType.CLEAR_LIST]: CapabilityCategory.GROCERY,

  // Profile
  [IntentType.PREFERENCE_UPDATE]: CapabilityCategory.PROFILE,
  [IntentType.PROFILE_QUERY]: CapabilityCategory.PROFILE,
  [IntentType.READ_FILE]: CapabilityCategory.PROFILE,
  [IntentType.WRITE_FILE]: CapabilityCategory.PROFILE,

  // System
  [IntentType.MORNING_BRIEFING]: CapabilityCategory.SYSTEM,
  [IntentType.STATUS_CHECK]: CapabilityCategory.SYSTEM,
  [IntentType.HELP]: CapabilityCategory.SYSTEM,
  [IntentType.UNKNOWN]: CapabilityCategory.SYSTEM,
};

// ============================================================================
// CAPABILITY-TO-AGENT MAPPING
// ============================================================================

/**
 * Maps capability categories to their owning agents
 */
export const CAPABILITY_TO_AGENT: Record<CapabilityCategory, AgentId[]> = {
  [CapabilityCategory.COMMUNICATION]: [AgentId.COMMS_PILOT],
  [CapabilityCategory.SCHEDULING]: [AgentId.OPS_PLANNER],
  [CapabilityCategory.TASK_MANAGEMENT]: [AgentId.OPS_PLANNER],
  [CapabilityCategory.INFORMATION]: [AgentId.RESEARCH_SCOUT],
  [CapabilityCategory.MEMORY]: [AgentId.MEMORY_CURATOR],
  [CapabilityCategory.GROCERY]: [AgentId.OPS_PLANNER],
  [CapabilityCategory.PROFILE]: [AgentId.PERSONAL_DATA_STEWARD],
  [CapabilityCategory.SYSTEM]: [AgentId.SAFETY_AUDITOR, AgentId.OPS_PLANNER, AgentId.MEMORY_CURATOR], // SafetyAuditor for status/validation, OpsPlanner for briefing, MemoryCurator for memory-related
};

/**
 * Maps tools to their owning agents
 */
export const TOOL_TO_AGENT: Record<string, AgentId> = {
  // Communication tools -> CommsPilot
  send_sms: AgentId.COMMS_PILOT,
  configure_daily_checkin: AgentId.COMMS_PILOT,
  get_daily_checkin_status: AgentId.COMMS_PILOT,
  stop_daily_checkin: AgentId.COMMS_PILOT,
  send_checkin_now: AgentId.COMMS_PILOT,

  // Reminder tools -> OpsPlanner
  set_reminder: AgentId.OPS_PLANNER,
  list_reminders: AgentId.OPS_PLANNER,
  cancel_reminder: AgentId.OPS_PLANNER,

  // Task tools -> OpsPlanner
  add_task: AgentId.OPS_PLANNER,
  list_tasks: AgentId.OPS_PLANNER,
  update_task: AgentId.OPS_PLANNER,
  complete_task: AgentId.OPS_PLANNER,
  delete_task: AgentId.OPS_PLANNER,
  clear_completed_tasks: AgentId.OPS_PLANNER,

  // Calendar tools -> OpsPlanner
  get_calendar_events: AgentId.OPS_PLANNER,
  get_today_events: AgentId.OPS_PLANNER,
  get_upcoming_events: AgentId.OPS_PLANNER,
  create_calendar_event: AgentId.OPS_PLANNER,
  update_calendar_event: AgentId.OPS_PLANNER,
  delete_calendar_event: AgentId.OPS_PLANNER,

  // Grocery tools -> OpsPlanner
  add_grocery_item: AgentId.OPS_PLANNER,
  list_grocery_items: AgentId.OPS_PLANNER,
  mark_grocery_purchased: AgentId.OPS_PLANNER,
  remove_grocery_item: AgentId.OPS_PLANNER,
  clear_purchased_groceries: AgentId.OPS_PLANNER,
  clear_all_groceries: AgentId.OPS_PLANNER,

  // Search tools -> ResearchScout
  web_search: AgentId.RESEARCH_SCOUT,
  perplexity_search: AgentId.RESEARCH_SCOUT,

  // Memory tools -> MemoryCurator
  search_lifelogs: AgentId.MEMORY_CURATOR,
  get_recent_lifelogs: AgentId.MEMORY_CURATOR,
  get_lifelog_context: AgentId.MEMORY_CURATOR,
  check_omi_status: AgentId.MEMORY_CURATOR,

  // File tools -> PersonalDataSteward
  read_file: AgentId.PERSONAL_DATA_STEWARD,
  write_file: AgentId.PERSONAL_DATA_STEWARD,
  list_files: AgentId.PERSONAL_DATA_STEWARD,

  // Utility tools -> OpsPlanner (time/weather) and MemoryCurator (briefing context)
  get_current_time: AgentId.OPS_PLANNER,
  get_weather: AgentId.OPS_PLANNER,
  get_morning_briefing: AgentId.OPS_PLANNER, // OpsPlanner owns, but coordinates with MemoryCurator
};

/**
 * Gets the owning agent for a specific tool
 */
export function getAgentForTool(toolName: string): AgentId | null {
  return TOOL_TO_AGENT[toolName] || null;
}

/**
 * Gets all agents responsible for a capability category
 */
export function getAgentsForCapability(category: CapabilityCategory): AgentId[] {
  return CAPABILITY_TO_AGENT[category] || [];
}

/**
 * Maps specific intents to their primary owning agent
 * This provides fine-grained routing for intents within shared categories
 */
export const INTENT_TO_AGENT: Partial<Record<IntentType, AgentId>> = {
  [IntentType.HELP]: AgentId.SAFETY_AUDITOR,
  [IntentType.STATUS_CHECK]: AgentId.SAFETY_AUDITOR,
  [IntentType.UNKNOWN]: AgentId.SAFETY_AUDITOR,
  [IntentType.MORNING_BRIEFING]: AgentId.OPS_PLANNER,
  [IntentType.SAVE_MEMORY]: AgentId.MEMORY_CURATOR,
};

/**
 * Gets the primary agent for an intent type
 * Uses explicit intent-to-agent mapping when available, falls back to category mapping
 */
export function getAgentForIntent(intentType: IntentType): AgentId {
  if (INTENT_TO_AGENT[intentType]) {
    return INTENT_TO_AGENT[intentType]!;
  }
  const category = INTENT_TO_CATEGORY[intentType];
  const agents = CAPABILITY_TO_AGENT[category];
  return agents[0] || AgentId.CONDUCTOR;
}

// ============================================================================
// HANDOFF PROTOCOL
// ============================================================================

/**
 * Reasons for initiating a handoff
 */
export enum HandoffReason {
  /** Intent requires different agent's capabilities */
  CAPABILITY_REQUIRED = "capability_required",
  /** Current agent completed its part, next step needed */
  TASK_CONTINUATION = "task_continuation",
  /** Safety check required */
  SAFETY_CHECK = "safety_check",
  /** Multi-agent coordination needed */
  COORDINATION = "coordination",
  /** Fallback due to error */
  ERROR_FALLBACK = "error_fallback",
  /** Returning control to conductor */
  COMPLETION = "completion",
}

/**
 * Status of a handoff operation
 */
export enum HandoffStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  REJECTED = "rejected",
}

/**
 * Request for an agent-to-agent handoff
 */
export interface HandoffRequest {
  /** Unique identifier for this handoff */
  handoffId: string;
  /** Agent initiating the handoff */
  sourceAgent: AgentId;
  /** Agent receiving the handoff */
  targetAgent: AgentId;
  /** Reason for the handoff */
  reason: HandoffReason;
  /** The classified intent being handed off */
  intent: ClassifiedIntent;
  /** Conversation context to pass along */
  context: HandoffContext;
  /** Priority level (1-5, 1 being highest) */
  priority: number;
  /** Timestamp of the request */
  timestamp: string;
  /** Optional: specific tools the target should use */
  suggestedTools?: string[];
  /** Optional: any partial results from source agent */
  partialResults?: Record<string, unknown>;
}

/**
 * Context passed during a handoff
 */
export interface HandoffContext {
  /** Original user message */
  userMessage: string;
  /** Conversation ID for continuity */
  conversationId: string;
  /** User permissions */
  permissions: ToolPermissions;
  /** Phone number if SMS conversation */
  phoneNumber?: string;
  /** Relevant memories or context */
  memories?: string[];
  /** Any prior agent responses in this chain */
  priorResponses?: AgentResponse[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Response from an agent after completing work
 */
export interface AgentResponse {
  /** Agent that generated this response */
  agentId: AgentId;
  /** Whether the task was completed successfully */
  success: boolean;
  /** The response content */
  content: string;
  /** Any tool calls made */
  toolCalls?: ToolCallRecord[];
  /** Errors if any */
  error?: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Record of a tool call made by an agent
 */
export interface ToolCallRecord {
  /** Name of the tool called */
  toolName: string;
  /** Arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** Result from the tool */
  result: string;
  /** Whether the call succeeded */
  success: boolean;
}

/**
 * Response to a handoff request
 */
export interface HandoffResponse {
  /** The handoff ID being responded to */
  handoffId: string;
  /** Status of the handoff */
  status: HandoffStatus;
  /** The agent's response */
  result: AgentResponse;
  /** Next agent in the chain, if any */
  nextAgent?: AgentId;
  /** Whether the original request is fully complete */
  completionStatus: CompletionStatus;
  /** If incomplete, what's still needed */
  pendingActions?: string[];
  /** Timestamp of the response */
  timestamp: string;
}

/**
 * Completion status of a request
 */
export enum CompletionStatus {
  /** Request fully completed */
  COMPLETE = "complete",
  /** Request partially completed, more work needed */
  PARTIAL = "partial",
  /** Request failed */
  FAILED = "failed",
  /** Request requires user input to continue */
  AWAITING_INPUT = "awaiting_input",
  /** Request handed off to another agent */
  HANDED_OFF = "handed_off",
}

// ============================================================================
// PERMISSION MATRIX
// ============================================================================

/**
 * Access tier levels for contacts
 */
export enum AccessTier {
  /** Full admin access - can do anything */
  ADMIN = "admin",
  /** Family member - most features, some restrictions */
  FAMILY = "family",
  /** Friend - limited features */
  FRIEND = "friend",
  /** Acquaintance - very limited, mostly read-only */
  ACQUAINTANCE = "acquaintance",
  /** Unknown - minimal access, safety mode */
  UNKNOWN = "unknown",
}

/**
 * Permission requirements for each tool
 */
export interface ToolPermissionRequirements {
  /** Minimum access tier required */
  minimumTier: AccessTier;
  /** Specific permission flags required from ToolPermissions */
  requiredPermissions: (keyof ToolPermissions)[];
  /** Whether admin can override other requirements */
  adminOverride: boolean;
  /** Additional custom checks */
  customChecks?: string[];
}

/**
 * Complete permission matrix mapping tools to their requirements
 */
export const TOOL_PERMISSION_MATRIX: Record<string, ToolPermissionRequirements> = {
  // Communication tools - require admin for sending
  send_sms: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["isAdmin"],
    adminOverride: false, // Only admins can send SMS
  },
  configure_daily_checkin: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["isAdmin"],
    adminOverride: false,
  },
  get_daily_checkin_status: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["isAdmin"],
    adminOverride: false,
  },
  stop_daily_checkin: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["isAdmin"],
    adminOverride: false,
  },
  send_checkin_now: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["isAdmin"],
    adminOverride: false,
  },

  // Reminder tools - need reminder permission
  set_reminder: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canSetReminders"],
    adminOverride: true,
  },
  list_reminders: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canSetReminders"],
    adminOverride: true,
  },
  cancel_reminder: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canSetReminders"],
    adminOverride: true,
  },

  // Task tools - need task permission
  add_task: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessTasks"],
    adminOverride: true,
  },
  list_tasks: {
    minimumTier: AccessTier.FRIEND,
    requiredPermissions: ["canAccessTasks"],
    adminOverride: true,
  },
  update_task: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessTasks"],
    adminOverride: true,
  },
  complete_task: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessTasks"],
    adminOverride: true,
  },
  delete_task: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessTasks"],
    adminOverride: true,
  },
  clear_completed_tasks: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessTasks"],
    adminOverride: true,
  },

  // Calendar tools - need calendar permission
  get_calendar_events: {
    minimumTier: AccessTier.FRIEND,
    requiredPermissions: ["canAccessCalendar"],
    adminOverride: true,
  },
  get_today_events: {
    minimumTier: AccessTier.FRIEND,
    requiredPermissions: ["canAccessCalendar"],
    adminOverride: true,
  },
  get_upcoming_events: {
    minimumTier: AccessTier.FRIEND,
    requiredPermissions: ["canAccessCalendar"],
    adminOverride: true,
  },
  create_calendar_event: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessCalendar"],
    adminOverride: true,
  },
  update_calendar_event: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessCalendar"],
    adminOverride: true,
  },
  delete_calendar_event: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessCalendar"],
    adminOverride: true,
  },

  // Grocery tools - need grocery permission
  add_grocery_item: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessGrocery"],
    adminOverride: true,
  },
  list_grocery_items: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessGrocery"],
    adminOverride: true,
  },
  mark_grocery_purchased: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessGrocery"],
    adminOverride: true,
  },
  remove_grocery_item: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessGrocery"],
    adminOverride: true,
  },
  clear_purchased_groceries: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessGrocery"],
    adminOverride: true,
  },
  clear_all_groceries: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["canAccessGrocery"],
    adminOverride: false, // Only admins can clear everything
  },

  // Search tools - generally open
  web_search: {
    minimumTier: AccessTier.UNKNOWN,
    requiredPermissions: [],
    adminOverride: true,
  },
  perplexity_search: {
    minimumTier: AccessTier.UNKNOWN,
    requiredPermissions: [],
    adminOverride: true,
  },

  // Memory tools - need personal info access
  search_lifelogs: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["canAccessPersonalInfo"],
    adminOverride: false, // Lifelogs are sensitive
  },
  get_recent_lifelogs: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["canAccessPersonalInfo"],
    adminOverride: false,
  },
  get_lifelog_context: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["canAccessPersonalInfo"],
    adminOverride: false,
  },
  check_omi_status: {
    minimumTier: AccessTier.ACQUAINTANCE,
    requiredPermissions: [],
    adminOverride: true,
  },

  // File tools - need personal info access
  read_file: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessPersonalInfo"],
    adminOverride: true,
  },
  write_file: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessPersonalInfo"],
    adminOverride: true,
  },
  list_files: {
    minimumTier: AccessTier.FAMILY,
    requiredPermissions: ["canAccessPersonalInfo"],
    adminOverride: true,
  },

  // Utility tools - generally open
  get_current_time: {
    minimumTier: AccessTier.UNKNOWN,
    requiredPermissions: [],
    adminOverride: true,
  },
  get_weather: {
    minimumTier: AccessTier.UNKNOWN,
    requiredPermissions: [],
    adminOverride: true,
  },
  get_morning_briefing: {
    minimumTier: AccessTier.ADMIN,
    requiredPermissions: ["canAccessCalendar", "canAccessTasks"],
    adminOverride: false, // Briefing contains sensitive data
  },
};

/**
 * Checks if a user with given permissions can use a specific tool
 */
export function canUseTool(
  toolName: string,
  permissions: ToolPermissions,
  accessTier: AccessTier = AccessTier.UNKNOWN
): boolean {
  const requirements = TOOL_PERMISSION_MATRIX[toolName];
  if (!requirements) {
    return false; // Unknown tools are blocked
  }

  // Admin override check
  if (requirements.adminOverride && permissions.isAdmin) {
    return true;
  }

  // Check minimum tier
  const tierOrder = [
    AccessTier.UNKNOWN,
    AccessTier.ACQUAINTANCE,
    AccessTier.FRIEND,
    AccessTier.FAMILY,
    AccessTier.ADMIN,
  ];
  const userTierIndex = tierOrder.indexOf(accessTier);
  const requiredTierIndex = tierOrder.indexOf(requirements.minimumTier);
  
  if (userTierIndex < requiredTierIndex) {
    return false;
  }

  // Check required permissions
  for (const perm of requirements.requiredPermissions) {
    if (!permissions[perm]) {
      return false;
    }
  }

  return true;
}

/**
 * Gets the list of tools a user can access based on their permissions
 */
export function getAvailableTools(
  permissions: ToolPermissions,
  accessTier: AccessTier = AccessTier.UNKNOWN
): string[] {
  return Object.keys(TOOL_PERMISSION_MATRIX).filter(toolName =>
    canUseTool(toolName, permissions, accessTier)
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a new handoff request
 */
export function createHandoffRequest(
  sourceAgent: AgentId,
  targetAgent: AgentId,
  reason: HandoffReason,
  intent: ClassifiedIntent,
  context: HandoffContext,
  options?: {
    priority?: number;
    suggestedTools?: string[];
    partialResults?: Record<string, unknown>;
  }
): HandoffRequest {
  return {
    handoffId: `handoff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sourceAgent,
    targetAgent,
    reason,
    intent,
    context,
    priority: options?.priority ?? 3,
    timestamp: new Date().toISOString(),
    suggestedTools: options?.suggestedTools,
    partialResults: options?.partialResults,
  };
}

/**
 * Creates a handoff response
 */
export function createHandoffResponse(
  handoffId: string,
  status: HandoffStatus,
  result: AgentResponse,
  completionStatus: CompletionStatus,
  options?: {
    nextAgent?: AgentId;
    pendingActions?: string[];
  }
): HandoffResponse {
  return {
    handoffId,
    status,
    result,
    nextAgent: options?.nextAgent,
    completionStatus,
    pendingActions: options?.pendingActions,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Determines which agents are needed for an intent
 */
export function getAgentsForClassifiedIntent(intent: ClassifiedIntent): AgentId[] {
  const category = INTENT_TO_CATEGORY[intent.type];
  const primaryAgents = CAPABILITY_TO_AGENT[category] || [];
  
  // Add SafetyAuditor for sensitive operations
  const sensitiveCategories: CapabilityCategory[] = [
    CapabilityCategory.COMMUNICATION,
    CapabilityCategory.PROFILE,
    CapabilityCategory.MEMORY,
  ];
  
  if (sensitiveCategories.includes(category)) {
    return [...primaryAgents, AgentId.SAFETY_AUDITOR];
  }
  
  return primaryAgents;
}

// ============================================================================
// EXPORTS FOR PYTHON AGENTS
// ============================================================================

/**
 * Export all types and constants as a single object for easy import
 */
export const AgentSpec = {
  // Enums
  AgentId,
  AgentStatus,
  CapabilityCategory,
  IntentType,
  HandoffReason,
  HandoffStatus,
  CompletionStatus,
  AccessTier,

  // Agent definitions
  ConductorAgent,
  MemoryCuratorAgent,
  CommsPilotAgent,
  OpsPlannerAgent,
  ResearchScoutAgent,
  PersonalDataStewardAgent,
  SafetyAuditorAgent,
  AGENT_REGISTRY,

  // Mappings
  INTENT_TO_CATEGORY,
  CAPABILITY_TO_AGENT,
  TOOL_TO_AGENT,
  TOOL_PERMISSION_MATRIX,

  // Functions
  getAgentForTool,
  getAgentsForCapability,
  getAgentForIntent,
  canUseTool,
  getAvailableTools,
  createHandoffRequest,
  createHandoffResponse,
  getAgentsForClassifiedIntent,
} as const;

export default AgentSpec;
