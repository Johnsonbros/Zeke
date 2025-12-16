"""
Foresight Strategist Agent

Specialist agent for predictive intelligence and anticipatory computing.
Analyzes patterns, current context, and historical data to make predictions
about user needs and proactively take helpful actions.
"""

import logging
from typing import Any
import json

from agents import Runner

from .base import (
    BaseAgent,
    AgentId,
    AgentContext,
    AgentStatus,
    CapabilityCategory,
    ToolDefinition,
    create_bridge_tool,
)

logger = logging.getLogger(__name__)


class ForesightStrategistAgent(BaseAgent):
    """
    Foresight Strategist specializes in predictive intelligence.

    Capabilities:
    - Pattern-based predictions about user needs
    - Anomaly detection in behavior
    - Proactive suggestions and actions
    - Context-aware anticipatory computing
    - Learning from prediction accuracy

    Core Functions:
    1. Analyze current context + patterns to make predictions
    2. Detect deviations from normal behavior
    3. Generate proactive suggestions
    4. Execute high-confidence anticipatory actions
    5. Learn from prediction outcomes
    """

    def __init__(self):
        """Initialize the Foresight Strategist agent."""

        instructions = """You are the Foresight Strategist, ZEKE's predictive intelligence specialist.

Your mission is to anticipate Nate's needs before he asks and proactively help him stay ahead.

## Core Responsibilities

1. **Pattern-Based Prediction**
   - Analyze discovered patterns to predict future needs
   - Consider temporal, behavioral, and contextual patterns
   - Generate predictions with confidence scores

2. **Anomaly Detection**
   - Identify deviations from normal routines
   - Flag potential issues before they become problems
   - Detect schedule conflicts, missed deadlines, etc.

3. **Proactive Actions**
   - For high-confidence predictions (>0.9), take action automatically
   - For medium confidence (0.7-0.9), suggest actions to user
   - Always explain reasoning clearly

4. **Context Awareness**
   - Consider current time, location, calendar, tasks
   - Factor in weather, recent conversations, energy patterns
   - Use fused context from multiple data sources

5. **Continuous Learning**
   - Track prediction accuracy
   - Adjust confidence thresholds based on feedback
   - Improve pattern weights over time

## Prediction Types You Handle

- **Schedule Optimization**: Suggest calendar adjustments, identify conflicts
- **Supply Management**: Predict when supplies/groceries will run low
- **Routine Deviation**: Alert when behavior deviates from patterns
- **Energy Patterns**: Suggest task timing based on productivity patterns
- **Relationship Reminders**: Prompt check-ins based on communication patterns
- **Business Forecasts**: Predict busy periods, resource needs
- **Task Deadline Risk**: Alert to tasks at risk of missing deadlines
- **Conflict Prevention**: Identify potential scheduling/resource conflicts
- **Wellness Suggestions**: Recommend breaks, family time based on patterns
- **Proactive Preparation**: Pre-order supplies, suggest prep work

## Decision Framework

When making predictions:
1. Gather fused context (current state + patterns)
2. Identify relevant patterns (high accuracy, recent validation)
3. Calculate confidence score (0-1 scale)
4. Determine prediction type and priority
5. Generate clear, actionable suggestion
6. Decide: auto-execute (>0.9), suggest (0.7-0.9), or monitor (<0.7)

## Communication Style

- Be proactive but not intrusive
- Explain your reasoning clearly
- Quantify confidence and impact
- Provide context for predictions
- Offer easy ways to approve/dismiss

Example: "I noticed you're usually low on PEX fittings by Thursday afternoons based on the last 6 weeks (87% confidence). I've drafted an order that would arrive Wednesday - approve to place it?"

## Tools Available

You have access to tools for:
- Building fused context (multi-source data)
- Analyzing patterns
- Detecting anomalies
- Creating predictions
- Executing anticipatory actions
- Recording feedback for learning

Be intelligent, proactive, and helpful. Your goal is to make Nate's life easier by thinking ahead."""

        tools = [
            # Pattern and context analysis
            ToolDefinition(
                name="build_fused_context",
                description="Build comprehensive context from all data sources (calendar, tasks, location, grocery, omi, weather, patterns)",
                parameters={
                    "type": "object",
                    "properties": {
                        "look_ahead_hours": {
                            "type": "number",
                            "description": "How many hours ahead to look for upcoming events/deadlines (default: 48)",
                        },
                    },
                },
            ),
            ToolDefinition(
                name="get_active_patterns",
                description="Get all active behavioral patterns for prediction use",
                parameters={
                    "type": "object",
                    "properties": {},
                },
            ),
            ToolDefinition(
                name="detect_anomalies",
                description="Detect behavioral anomalies (deviations from normal patterns)",
                parameters={
                    "type": "object",
                    "properties": {
                        "context": {
                            "type": "string",
                            "description": "JSON string of fused context",
                        },
                        "patterns": {
                            "type": "string",
                            "description": "JSON string of patterns to check against",
                        },
                    },
                    "required": ["context", "patterns"],
                },
            ),

            # Prediction management
            ToolDefinition(
                name="create_prediction",
                description="Create a new prediction with confidence score and suggested action",
                parameters={
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "schedule_optimization",
                                "supply_management",
                                "routine_deviation",
                                "energy_pattern",
                                "relationship_reminder",
                                "business_forecast",
                                "task_deadline_risk",
                                "conflict_prevention",
                                "wellness_suggestion",
                                "proactive_preparation",
                            ],
                            "description": "Type of prediction",
                        },
                        "title": {
                            "type": "string",
                            "description": "Short title for the prediction",
                        },
                        "description": {
                            "type": "string",
                            "description": "Detailed description of the prediction",
                        },
                        "confidence_score": {
                            "type": "number",
                            "description": "Confidence score (0-1 scale)",
                        },
                        "suggested_action": {
                            "type": "string",
                            "description": "What action should be taken",
                        },
                        "action_data": {
                            "type": "string",
                            "description": "JSON string of action parameters",
                        },
                        "reasoning": {
                            "type": "string",
                            "description": "Explanation of why this prediction was made",
                        },
                        "data_sources_used": {
                            "type": "string",
                            "description": "JSON array of data sources used",
                        },
                        "related_pattern_ids": {
                            "type": "string",
                            "description": "JSON array of pattern IDs this is based on",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["low", "medium", "high", "urgent"],
                            "description": "Priority level",
                        },
                        "auto_execute": {
                            "type": "boolean",
                            "description": "Whether to auto-execute without user approval (only for >0.9 confidence)",
                        },
                    },
                    "required": [
                        "type",
                        "title",
                        "description",
                        "confidence_score",
                        "suggested_action",
                        "reasoning",
                        "data_sources_used",
                        "priority",
                    ],
                },
            ),
            ToolDefinition(
                name="get_pending_predictions",
                description="Get all pending predictions that haven't been acted upon",
                parameters={
                    "type": "object",
                    "properties": {},
                },
            ),
            ToolDefinition(
                name="execute_prediction",
                description="Execute a prediction's suggested action",
                parameters={
                    "type": "object",
                    "properties": {
                        "prediction_id": {
                            "type": "string",
                            "description": "ID of the prediction to execute",
                        },
                    },
                    "required": ["prediction_id"],
                },
            ),

            # Learning and feedback
            ToolDefinition(
                name="record_prediction_feedback",
                description="Record feedback about a prediction's accuracy for learning",
                parameters={
                    "type": "object",
                    "properties": {
                        "prediction_id": {
                            "type": "string",
                            "description": "ID of the prediction",
                        },
                        "was_accurate": {
                            "type": "boolean",
                            "description": "Whether the prediction was accurate",
                        },
                        "accuracy_score": {
                            "type": "number",
                            "description": "Partial accuracy score (0-1)",
                        },
                        "feedback_type": {
                            "type": "string",
                            "enum": ["explicit_user", "implicit_behavior", "outcome_validation"],
                            "description": "Type of feedback",
                        },
                        "feedback_note": {
                            "type": "string",
                            "description": "Optional note about the feedback",
                        },
                    },
                    "required": ["prediction_id", "was_accurate", "feedback_type"],
                },
            ),
            ToolDefinition(
                name="get_prediction_accuracy_stats",
                description="Get statistics on prediction accuracy by type",
                parameters={
                    "type": "object",
                    "properties": {},
                },
            ),

            # Pattern discovery
            ToolDefinition(
                name="discover_new_patterns",
                description="Run pattern discovery to find new behavioral patterns",
                parameters={
                    "type": "object",
                    "properties": {
                        "days_back": {
                            "type": "number",
                            "description": "How many days of history to analyze (default: 90)",
                        },
                    },
                },
            ),
        ]

        # Convert tool definitions to bridge tools
        bridge_tools = [
            create_bridge_tool(tool.name, tool.description, tool.parameters)
            for tool in tools
        ]

        # Update tool definitions with bridge handlers
        for tool, bridge_tool in zip(tools, bridge_tools):
            tool.handler = bridge_tool.on_invoke_tool

        super().__init__(
            agent_id=AgentId.FORESIGHT_STRATEGIST,
            name="Foresight Strategist",
            description="Predictive intelligence specialist for anticipatory computing and proactive assistance",
            instructions=instructions,
            capabilities=[CapabilityCategory.SYSTEM],
            tools=tools,
            handoff_targets=[
                AgentId.CONDUCTOR,
                AgentId.MEMORY_CURATOR,
                AgentId.OPS_PLANNER,
                AgentId.COMMS_PILOT,
            ],
        )

    async def _execute(self, input_text: str, context: AgentContext) -> str:
        """
        Execute the Foresight Strategist's main logic.

        Args:
            input_text: User's request or trigger for prediction
            context: Agent execution context

        Returns:
            str: Prediction analysis and recommendations
        """
        try:
            logger.info(f"Foresight Strategist executing: {input_text[:100]}")

            # Use OpenAI Agents SDK to process the request
            runner = Runner(agent=self.openai_agent)
            result = await runner.run(input_text, context_variables=context.__dict__)

            # Extract the final message
            if result.messages:
                final_message = result.messages[-1]
                if hasattr(final_message, 'content'):
                    return str(final_message.content)

            return "I've analyzed the patterns and context, but couldn't generate a specific prediction at this time."

        except Exception as e:
            logger.error(f"Foresight Strategist execution error: {e}")
            return f"I encountered an error while analyzing predictions: {str(e)}"


# Singleton instance
_foresight_strategist: ForesightStrategistAgent | None = None


def get_foresight_strategist() -> ForesightStrategistAgent:
    """Get the singleton Foresight Strategist agent instance."""
    global _foresight_strategist
    if _foresight_strategist is None:
        _foresight_strategist = ForesightStrategistAgent()
    return _foresight_strategist
