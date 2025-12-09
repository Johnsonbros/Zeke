"""
Lightweight Intent Router - Fast pattern-based intent classification.

This module provides a high-performance alternative to LLM-based intent classification.
It uses keyword matching, regex patterns, and entity extraction to classify intents
without requiring an LLM call, saving both cost and latency.

The router is designed to handle ~80% of common intents directly, only falling back
to LLM classification for truly ambiguous or complex requests.
"""

import re
from dataclasses import dataclass, field
from typing import Any

from .agents.base import CapabilityCategory, AgentId, IntentType


@dataclass
class RouterIntent:
    """
    Lightweight intent classification result.
    
    Attributes:
        category: The detected intent category
        type: Specific intent type
        confidence: Confidence score (0-1)
        entities: Extracted entities from the request
        raw_message: Original user message
        requires_coordination: Whether this requires multi-agent coordination
        requires_memory_context: Whether memory context would help
        needs_llm_fallback: Whether LLM should be used for better classification
    """
    category: CapabilityCategory
    type: IntentType
    confidence: float
    entities: dict[str, Any] = field(default_factory=dict)
    raw_message: str = ""
    requires_coordination: bool = False
    requires_memory_context: bool = False
    needs_llm_fallback: bool = False


@dataclass
class PatternRule:
    """A pattern matching rule for intent classification."""
    patterns: list[str]
    category: CapabilityCategory
    intent_type: IntentType
    confidence: float = 0.85
    requires_memory: bool = False
    entity_extractors: dict[str, str] = field(default_factory=dict)


INTENT_PATTERNS: list[PatternRule] = [
    PatternRule(
        patterns=[
            r"\b(text|sms|message|send)\b.*(to|for)\s+(\w+)",
            r"\btell\s+(\w+)\s+that\b",
            r"\blet\s+(\w+)\s+know\b",
            r"\bsend\s+(\w+)\s+(a\s+)?(message|text)\b",
        ],
        category=CapabilityCategory.COMMUNICATION,
        intent_type=IntentType.SEND_MESSAGE,
        confidence=0.9,
        entity_extractors={"recipient": r"(?:to|tell|let)\s+(\w+)"}
    ),
    PatternRule(
        patterns=[r"\bcheck[\s-]?in\b", r"\bhow\s+is\s+(\w+)\b(?!.*weather)"],
        category=CapabilityCategory.COMMUNICATION,
        intent_type=IntentType.CHECK_IN,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[r"\b(configure|setup|set\s+up)\s+check[\s-]?in\b"],
        category=CapabilityCategory.COMMUNICATION,
        intent_type=IntentType.CONFIGURE_CHECKIN,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\b(find|look\s*up|get|what('?s|\s+is))\s+\w+('?s)?\s+(phone|number|contact|email)\b",
            r"\bcontact\s+(info|information)\s+(for|of)\b",
        ],
        category=CapabilityCategory.COMMUNICATION,
        intent_type=IntentType.CONTACT_LOOKUP,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(what('?s|\s+is)|show|check|look\s+at)\s+(my\s+)?(calendar|schedule|agenda)\b",
            r"\bwhat\s+(do\s+i\s+have|am\s+i\s+doing)\s+(today|tomorrow|this\s+week)\b",
            r"\b(any|do\s+i\s+have)\s+(meetings?|appointments?|events?)\b",
        ],
        category=CapabilityCategory.SCHEDULING,
        intent_type=IntentType.CALENDAR_QUERY,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\b(schedule|create|add|book|set\s+up)\s+(a\s+)?(meeting|appointment|event|call)\b",
            r"\bput\s+(a\s+)?(\w+)\s+on\s+(my\s+)?calendar\b",
        ],
        category=CapabilityCategory.SCHEDULING,
        intent_type=IntentType.CREATE_EVENT,
        confidence=0.9,
        entity_extractors={"event_title": r"(?:meeting|appointment|event|call)\s+(?:with\s+)?(\w+)"}
    ),
    PatternRule(
        patterns=[
            r"\b(move|reschedule|change|update)\s+(the\s+)?(meeting|appointment|event)\b",
        ],
        category=CapabilityCategory.SCHEDULING,
        intent_type=IntentType.UPDATE_EVENT,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(cancel|delete|remove)\s+(the\s+)?(meeting|appointment|event)\b",
        ],
        category=CapabilityCategory.SCHEDULING,
        intent_type=IntentType.DELETE_EVENT,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\bremind\s+me\b",
            r"\bset\s+(a\s+)?reminder\b",
            r"\bdon'?t\s+let\s+me\s+forget\b",
        ],
        category=CapabilityCategory.SCHEDULING,
        intent_type=IntentType.SET_REMINDER,
        confidence=0.9,
        entity_extractors={"reminder_text": r"remind\s+me\s+(?:to\s+)?(.+?)(?:\s+(?:at|in|on|tomorrow|today)|$)"}
    ),
    PatternRule(
        patterns=[r"\b(cancel|delete|remove)\s+(the\s+)?reminder\b"],
        category=CapabilityCategory.SCHEDULING,
        intent_type=IntentType.CANCEL_REMINDER,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(add|create|new)\s+(a\s+)?task\b",
            r"\bi\s+need\s+to\b(?!.*buy|.*grocery)",
            r"\badd\s+to\s+(my\s+)?(to-?do|task)\s*list\b",
        ],
        category=CapabilityCategory.TASK_MANAGEMENT,
        intent_type=IntentType.ADD_TASK,
        confidence=0.85,
        entity_extractors={"task_name": r"(?:add|create)\s+(?:a\s+)?task\s*:?\s*(.+)"}
    ),
    PatternRule(
        patterns=[r"\b(update|change|edit|modify)\s+(the\s+)?task\b"],
        category=CapabilityCategory.TASK_MANAGEMENT,
        intent_type=IntentType.UPDATE_TASK,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(complete|finish|done|mark\s+as\s+done|check\s+off)\s+(the\s+)?task\b",
            r"\bi\s+(finished|completed|did)\s+",
        ],
        category=CapabilityCategory.TASK_MANAGEMENT,
        intent_type=IntentType.COMPLETE_TASK,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[r"\b(delete|remove)\s+(the\s+)?task\b"],
        category=CapabilityCategory.TASK_MANAGEMENT,
        intent_type=IntentType.DELETE_TASK,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(show|what('?s|\s+are)|list|view)\s+(my\s+)?(tasks?|to-?dos?)\b",
            r"\bwhat\s+(do\s+i\s+have|should\s+i)\s+to\s+do\b",
        ],
        category=CapabilityCategory.TASK_MANAGEMENT,
        intent_type=IntentType.VIEW_TASKS,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\b(search|look\s*up|find|google)\s+(for\s+)?",
            r"\bwhat\s+is\s+(a|an|the)\s+\w+\b",
            r"\bwho\s+is\b",
            r"\bwhere\s+is\b",
            r"\bhow\s+(do|does|to|can|much)\b",
        ],
        category=CapabilityCategory.INFORMATION,
        intent_type=IntentType.SEARCH,
        confidence=0.75,
        entity_extractors={"search_query": r"(?:search|look\s*up|find|google)\s+(?:for\s+)?(.+)"}
    ),
    PatternRule(
        patterns=[
            r"\bresearch\b",
            r"\btell\s+me\s+(more\s+)?about\b",
            r"\bexplain\b",
            r"\bwhat\s+do\s+you\s+know\s+about\b",
        ],
        category=CapabilityCategory.INFORMATION,
        intent_type=IntentType.RESEARCH,
        confidence=0.8,
        requires_memory=True,
    ),
    PatternRule(
        patterns=[
            r"\b(what('?s|\s+is)|how('?s|\s+is))\s+(the\s+)?weather\b",
            r"\bweather\s+(in|for|today|tomorrow)\b",
            r"\bis\s+it\s+(going\s+to\s+)?(rain|snow|cold|hot|warm)\b",
            r"\bdo\s+i\s+need\s+(an?\s+)?(umbrella|jacket|coat)\b",
        ],
        category=CapabilityCategory.INFORMATION,
        intent_type=IntentType.WEATHER,
        confidence=0.95,
    ),
    PatternRule(
        patterns=[
            r"\bwhat\s+time\s+is\s+it\b",
            r"\bwhat('?s|\s+is)\s+the\s+time\b",
            r"\bcurrent\s+time\b",
        ],
        category=CapabilityCategory.INFORMATION,
        intent_type=IntentType.TIME,
        confidence=0.95,
    ),
    PatternRule(
        patterns=[
            r"\bdo\s+you\s+remember\b",
            r"\bwhat\s+did\s+(i|we)\s+(say|talk|discuss|mention)\b",
            r"\brecall\b",
            r"\bwhat\s+do\s+you\s+know\s+about\s+(me|my)\b",
        ],
        category=CapabilityCategory.MEMORY,
        intent_type=IntentType.RECALL_FACT,
        confidence=0.85,
        requires_memory=True,
    ),
    PatternRule(
        patterns=[
            r"\b(search|look\s+through)\s+(my\s+)?(history|memories|past)\b",
            r"\bwhen\s+did\s+(i|we)\s+(last|first)\b",
        ],
        category=CapabilityCategory.MEMORY,
        intent_type=IntentType.SEARCH_HISTORY,
        confidence=0.85,
        requires_memory=True,
    ),
    PatternRule(
        patterns=[
            r"\b(lifelog|pendant|omi|recording)\b",
            r"\bwhat\s+(did\s+)?(i|we)\s+(talk|discuss|say)\s+about\b",
            r"\b(conversation|meeting)\s+recording\b",
            r"\bwhat\s+was\s+(said|discussed)\s+(in|during)\b",
        ],
        category=CapabilityCategory.OMI,
        intent_type=IntentType.LIFELOG_QUERY,
        confidence=0.9,
        requires_memory=True,
    ),
    PatternRule(
        patterns=[
            r"\bremember\s+(that|this)\b",
            r"\bsave\s+(this|that)\s+(to\s+)?memory\b",
            r"\bdon'?t\s+forget\s+that\b",
            r"\bnote\s+that\b",
        ],
        category=CapabilityCategory.MEMORY,
        intent_type=IntentType.SAVE_MEMORY,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\badd\s+(.+)\s+to\s+(the\s+)?(grocery|shopping)\s+list\b",
            r"\b(need|get|buy)\s+(.+)\s+(from|at)\s+(the\s+)?(store|grocery|market)\b",
            r"\bput\s+(.+)\s+on\s+(the\s+)?(grocery|shopping)\s+list\b",
        ],
        category=CapabilityCategory.GROCERY,
        intent_type=IntentType.ADD_ITEM,
        confidence=0.9,
        entity_extractors={"item_name": r"(?:add|need|get|buy|put)\s+(.+?)\s+(?:to|from|on|at)"}
    ),
    PatternRule(
        patterns=[
            r"\b(show|what('?s|\s+is)|check)\s+(the\s+)?(grocery|shopping)\s+list\b",
            r"\bwhat\s+do\s+(i|we)\s+need\s+(to\s+buy|from\s+the\s+store)\b",
        ],
        category=CapabilityCategory.GROCERY,
        intent_type=IntentType.CHECK_LIST,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\b(got|bought|purchased|crossed\s+off)\s+(.+)\b",
            r"\bmark\s+(.+)\s+as\s+(bought|purchased|done)\b",
        ],
        category=CapabilityCategory.GROCERY,
        intent_type=IntentType.MARK_PURCHASED,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(remove|delete|take\s+off)\s+(.+)\s+from\s+(the\s+)?(grocery|shopping)\s+list\b",
        ],
        category=CapabilityCategory.GROCERY,
        intent_type=IntentType.REMOVE_ITEM,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[r"\bclear\s+(the\s+)?(grocery|shopping)\s+list\b"],
        category=CapabilityCategory.GROCERY,
        intent_type=IntentType.CLEAR_LIST,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\b(update|change|set)\s+(my\s+)?preference\b",
            r"\bi\s+(prefer|like|don'?t\s+like)\b",
        ],
        category=CapabilityCategory.PROFILE,
        intent_type=IntentType.PREFERENCE_UPDATE,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(what('?s|\s+are)|show)\s+(my\s+)?(profile|preferences|settings)\b",
        ],
        category=CapabilityCategory.PROFILE,
        intent_type=IntentType.PROFILE_QUERY,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(read|open|show\s+me)\s+(the\s+)?file\b",
        ],
        category=CapabilityCategory.PROFILE,
        intent_type=IntentType.READ_FILE,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(write|save|create)\s+(a\s+)?file\b",
        ],
        category=CapabilityCategory.PROFILE,
        intent_type=IntentType.WRITE_FILE,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\b(morning|daily)\s+(briefing|brief|update|summary)\b",
            r"\bbrief\s+me\b",
            r"\bwhat('?s|\s+is)\s+(on\s+)?(my\s+)?(agenda|schedule)\s+(for\s+)?today\b",
            r"\bgood\s+morning\b",
        ],
        category=CapabilityCategory.SYSTEM,
        intent_type=IntentType.MORNING_BRIEFING,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\b(system\s+)?status\b",
            r"\bare\s+you\s+(working|running|online)\b",
        ],
        category=CapabilityCategory.SYSTEM,
        intent_type=IntentType.STATUS_CHECK,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\bhelp\b",
            r"\bwhat\s+can\s+you\s+do\b",
            r"\bwhat\s+are\s+your\s+(capabilities|features)\b",
            r"\bhow\s+do\s+(i|you)\s+use\b",
        ],
        category=CapabilityCategory.SYSTEM,
        intent_type=IntentType.HELP,
        confidence=0.9,
    ),
    PatternRule(
        patterns=[
            r"\b(show|view|what\s+are)\s+(my\s+)?predictions?\b",
        ],
        category=CapabilityCategory.PREDICTION,
        intent_type=IntentType.VIEW_PREDICTIONS,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\banalyze\s+(my\s+)?patterns?\b",
            r"\bfind\s+patterns?\s+in\b",
        ],
        category=CapabilityCategory.PREDICTION,
        intent_type=IntentType.ANALYZE_PATTERNS,
        confidence=0.85,
    ),
    PatternRule(
        patterns=[
            r"\bdetect\s+(any\s+)?anomal(y|ies)\b",
            r"\b(anything\s+)?(unusual|strange|abnormal)\b",
        ],
        category=CapabilityCategory.PREDICTION,
        intent_type=IntentType.DETECT_ANOMALIES,
        confidence=0.8,
    ),
]

COORDINATION_PATTERNS = [
    r"\b(and|also|then|after\s+that)\b",
    r"\b(first|second|third)\b.*\b(then|next|after)\b",
]

TIME_PATTERNS = {
    "date": [
        r"\b(today|tomorrow|yesterday)\b",
        r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        r"\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b",
        r"\b(next|this|last)\s+(week|month|year)\b",
        r"\b(in\s+)?(\d+)\s+(minute|hour|day|week|month)s?\b",
    ],
    "time": [
        r"\b(\d{1,2}:\d{2})\s*(am|pm)?\b",
        r"\b(\d{1,2})\s*(am|pm)\b",
        r"\b(noon|midnight|morning|afternoon|evening|night)\b",
        r"\bin\s+(\d+)\s+(minute|hour)s?\b",
    ],
}


class IntentRouter:
    """
    Fast, pattern-based intent router that classifies user messages
    without requiring an LLM call for most common intents.
    """
    
    def __init__(self, llm_fallback_threshold: float = 0.6):
        """
        Initialize the intent router.
        
        Args:
            llm_fallback_threshold: Confidence threshold below which LLM fallback is suggested
        """
        self.llm_fallback_threshold = llm_fallback_threshold
        self._compiled_patterns: list[tuple[list[re.Pattern], PatternRule]] = []
        self._compile_patterns()
    
    def _compile_patterns(self) -> None:
        """Pre-compile all regex patterns for performance."""
        for rule in INTENT_PATTERNS:
            compiled = [re.compile(p, re.IGNORECASE) for p in rule.patterns]
            self._compiled_patterns.append((compiled, rule))
    
    def classify(self, message: str, context: dict[str, Any] | None = None) -> RouterIntent:
        """
        Classify a user message into an intent category and type.
        
        This method uses pattern matching for fast classification. If confidence
        is below the threshold, it will suggest LLM fallback.
        
        Args:
            message: The user's input message
            context: Optional context (conversation history, phone number, etc.)
            
        Returns:
            RouterIntent: The classified intent with extracted entities
        """
        message_lower = message.lower().strip()
        
        best_match: RouterIntent | None = None
        best_confidence: float = 0.0
        
        for compiled_patterns, rule in self._compiled_patterns:
            for pattern in compiled_patterns:
                match = pattern.search(message_lower)
                if match:
                    if rule.confidence > best_confidence:
                        entities = self._extract_entities(message, rule.entity_extractors)
                        entities.update(self._extract_time_entities(message))
                        
                        best_match = RouterIntent(
                            category=rule.category,
                            type=rule.intent_type,
                            confidence=rule.confidence,
                            entities=entities,
                            raw_message=message,
                            requires_coordination=self._check_coordination(message_lower),
                            requires_memory_context=rule.requires_memory,
                            needs_llm_fallback=False,
                        )
                        best_confidence = rule.confidence
                    break
        
        if best_match is None or best_confidence < self.llm_fallback_threshold:
            return RouterIntent(
                category=CapabilityCategory.SYSTEM,
                type=IntentType.UNKNOWN,
                confidence=0.3,
                entities=self._extract_time_entities(message),
                raw_message=message,
                requires_coordination=self._check_coordination(message_lower),
                requires_memory_context=True,
                needs_llm_fallback=True,
            )
        
        if best_match.confidence < 0.8:
            best_match.needs_llm_fallback = True
        
        return best_match
    
    def _extract_entities(self, message: str, extractors: dict[str, str]) -> dict[str, Any]:
        """Extract entities from the message using the provided regex patterns."""
        entities: dict[str, Any] = {}
        
        for entity_name, pattern in extractors.items():
            try:
                match = re.search(pattern, message, re.IGNORECASE)
                if match:
                    entities[entity_name] = match.group(1).strip()
            except (IndexError, AttributeError):
                pass
        
        return entities
    
    def _extract_time_entities(self, message: str) -> dict[str, Any]:
        """Extract date and time entities from the message."""
        entities: dict[str, Any] = {}
        
        for entity_type, patterns in TIME_PATTERNS.items():
            for pattern in patterns:
                match = re.search(pattern, message, re.IGNORECASE)
                if match:
                    entities[entity_type] = match.group(0).strip()
                    break
        
        return entities
    
    def _check_coordination(self, message: str) -> bool:
        """Check if the message requires multi-agent coordination."""
        for pattern in COORDINATION_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return True
        return False


_router_instance: IntentRouter | None = None


def get_router() -> IntentRouter:
    """Get the singleton IntentRouter instance."""
    global _router_instance
    if _router_instance is None:
        _router_instance = IntentRouter()
    return _router_instance


def classify_intent_fast(message: str, context: dict[str, Any] | None = None) -> RouterIntent:
    """
    Convenience function to classify an intent using the singleton router.
    
    Args:
        message: The user's input message
        context: Optional context for classification
        
    Returns:
        RouterIntent: The classified intent
    """
    return get_router().classify(message, context)
