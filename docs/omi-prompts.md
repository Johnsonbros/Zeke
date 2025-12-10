# Omi App Prompts for Zeke

This document contains ready-to-use prompts for creating Omi apps that integrate with Zeke's memory system.

## Setup Instructions

1. Open the Omi app on your iOS device
2. Go to **Explore** > **Create an App**
3. Copy the prompts below into the appropriate fields
4. Set the webhook URL to: `https://YOUR_REPLIT_URL/api/omi/memory-trigger`

---

## Memory Prompt: Zeke Life Logger

This prompt extracts structured data from every conversation and sends it to Zeke's knowledge base.

### Memory Prompt Text

```
Analyze this conversation and extract the following information in a structured format:

## PEOPLE MENTIONED
For each person mentioned:
- Name
- Context (how they were discussed)
- Relationship (friend/family/colleague/acquaintance if inferable)
- Sentiment (positive/neutral/negative based on how they were talked about)

## KEY TOPICS
List the main topics discussed with their relevance (high/medium/low):
- Topic name
- Category (work/personal/health/finance/family/hobby/other)

## ACTION ITEMS
Extract any tasks, commitments, or things to do:
- Task description
- Who should do it (if mentioned)
- Deadline or timeframe (if mentioned)
- Priority (high/medium/low based on urgency/importance cues)

## INSIGHTS
Identify important information learned:
- Decisions made
- Preferences expressed
- Goals mentioned
- Concerns raised
- New facts learned about people or situations

## EMOTIONAL CONTEXT
Summarize the overall mood and emotional tone of the conversation in one sentence.

If any section has no relevant items, respond with "None found" for that section.
Focus on information that would be valuable for a personal assistant to remember.
```

---

## Chat Prompt: Zeke Personal Assistant

This prompt makes Omi behave like Zeke - a thoughtful, proactive personal assistant.

### Chat Prompt Text

```
You are Zeke, a personal AI assistant with deep knowledge about the user's life, relationships, and goals.

Your personality:
- Thoughtful and attentive - you remember details and connect dots
- Proactive - you anticipate needs and offer relevant suggestions
- Warm but professional - you're friendly without being overly casual
- Direct and actionable - you give clear, useful advice

Your capabilities:
- You have access to the user's memory notes, contacts, tasks, and calendar
- You can recall past conversations and commitments
- You track relationships and remember important details about people
- You notice patterns and offer insights

When responding:
1. Reference relevant context from past conversations when helpful
2. Connect new information to what you already know
3. Proactively suggest next steps or follow-ups
4. Ask clarifying questions when needed to help better
5. Keep responses concise but complete

If you don't have enough information about something, say so honestly rather than making assumptions.

Remember: You're not just answering questions - you're actively helping manage and improve the user's life.
```

---

## Combined App: Zeke Memory System

For a complete experience, create an app with BOTH prompts above:
- **Memory Prompt**: Zeke Life Logger (for post-conversation extraction)
- **Chat Prompt**: Zeke Personal Assistant (for interactive chat)

This combination allows Zeke to:
1. Automatically learn from every conversation you have
2. Answer questions drawing on accumulated knowledge
3. Proactively surface relevant information

---

## Webhook Configuration

### Memory Trigger Webhook

**URL**: `https://YOUR_REPLIT_URL/api/omi/memory-trigger`

**What it receives**:
- Full conversation transcript
- Structured data (title, overview, action items from Omi's processing)
- Speaker information
- Timestamps

**What Zeke does**:
- Detects commands (e.g., "Hey Zeke, remind me to..." or "text Mom...")
- Executes detected commands through Zeke's full agent pipeline
- Extracts people, topics, action items, and insights
- Creates memory notes in the knowledge base
- Creates tasks for action items
- Links information to existing contacts

**Command Detection** (requires `OMI_COMMANDS_ENABLED=true`):
When enabled, Zeke listens for wake words combined with action patterns:
- Wake words: "Hey Zeke", "Zeke,", "Hey Z,", "OK Zeke"  
- Actions: remind me, text [name], add to grocery list, create task, schedule, search for, etc.

Commands require BOTH a wake word AND an action pattern to trigger execution.
When detected, Zeke executes the command using the same tools available via SMS and web chat.

**Security Note**: Command execution is disabled by default. To enable:
```bash
# Add to your environment variables
OMI_COMMANDS_ENABLED=true
```
Only enable this in trusted single-user deployments where you control the Omi device.

**Known Limitations**:
- Omi doesn't provide reliable speaker identification, so commands from any speaker in a conversation may trigger execution
- Commands mentioned in quotes or discussed third-party ("John said, hey Zeke remind me...") could potentially trigger
- For this reason, this feature is designed for single-user deployments where the Omi device owner is the authorized user

### Real-time Transcript Webhook (Optional)

**URL**: `https://YOUR_REPLIT_URL/api/omi/transcript`

Use this if you want real-time processing during conversations.

---

## Query API for Chat Tools

If you want Omi to query Zeke's knowledge during chat, use the Chat Tools feature:

**URL**: `https://YOUR_REPLIT_URL/api/omi/query`

**Method**: POST

**Body (read-only query)**:
```json
{
  "query": "What do I know about Sarah?",
  "limit": 10
}
```

**Body (with action execution)**:
```json
{
  "query": "Add milk to my grocery list",
  "executeActions": true
}
```

When `executeActions` is true AND `OMI_COMMANDS_ENABLED=true` is set, Zeke routes the query through the full agent pipeline, enabling:
- Creating/updating tasks
- Adding items to grocery list
- Sending SMS messages
- Searching the web
- Checking weather
- Managing calendar events
- Any other Zeke tool capability

**Response**:
```json
{
  "answer": "I've added milk to your grocery list.",
  "relevantMemories": [...],
  "relatedPeople": [...],
  "actionExecuted": true,
  "executedTools": ["add_grocery_item"]
}
```

---

## Testing Your Integration

1. After setting up your Omi app, have a test conversation
2. Check the logs at: `https://YOUR_REPLIT_URL/api/omi/logs`
3. Verify extracted data in Zeke's memory system
4. Test the query endpoint to retrieve information

---

## Troubleshooting

**Webhook not receiving data?**
- Ensure your Replit is running and accessible
- Check the webhook URL is correct (no trailing slash)
- Verify the app is installed and enabled in Omi

**Extraction not working?**
- Check `/api/omi/logs` for error messages
- Ensure OpenAI API key is configured
- Verify transcripts are long enough (min 20 characters)

**Query not returning results?**
- Ensure memory notes exist in the database
- Check the query format is correct
- Review server logs for errors
