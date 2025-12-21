# ZEKE Data Export - Comprehensive Backup

## Overview
The `/api/export` endpoint now provides a complete backup of all ZEKE data.

## Export Version: 2.0

### What's Included

#### Core Conversation Data
- **Conversations**: All conversation threads (web, SMS, voice)
- **Messages**: All messages within each conversation, organized by conversation ID

#### Memory and Knowledge
- **Memories**: All memory notes including superseded ones (facts, preferences, summaries, notes)
- **Preferences**: User and system preferences
- **Entities**: Knowledge graph entities
- **Insights**: AI-generated insights and observations

#### Personal Information
- **Contacts**: All contact records
- **Profile Sections**: User profile data sections

#### Task Management
- **Tasks**: All tasks including completed ones
- **Reminders**: All reminder records
- **Automations**: Configured automations
- **NL Automations**: Natural language automations

#### Lists
- **Grocery Items**: Shopping list items
- **Custom Lists**: User-created custom lists

#### Communication
- **Twilio Messages**: SMS message history (last 1000 messages)

#### Location Data
- **Saved Places**: All saved locations
- **Place Lists**: Organized collections of places

#### Documents and Files
- **Folders**: Document folder structure
- **Documents**: All document contents
- **Uploaded Files**: File upload metadata
- **Journal Entries**: Journal entries (last 1000)

#### Omi/Lifelog Data
- **Meetings**: Meeting records from Omi
- **Lifelog Action Items**: Action items extracted from lifelogs

#### AI Predictions and Patterns
- **Predictions**: AI-generated predictions
- **Patterns**: Recognized behavioral patterns

## Usage

### Web UI
Click the "Export Data" button on the Memory page to download a JSON file containing all your data.

### Programmatic Access
```bash
# Using the web UI (same-origin request)
curl http://localhost:5000/api/export

# Using secret token (if configured)
curl -H "x-export-token: YOUR_TOKEN" http://localhost:5000/api/export
# or
curl http://localhost:5000/api/export?token=YOUR_TOKEN
```

## Export Format

```json
{
  "exportedAt": "2025-12-21T03:45:00.000Z",
  "version": "2.0",
  "data": {
    "conversations": [...],
    "messages": {
      "conversation-id-1": [...],
      "conversation-id-2": [...]
    },
    "memories": [...],
    "preferences": [...],
    // ... all other data categories
  }
}
```

## Security

- Same-origin requests are automatically allowed from the web UI
- Cross-origin requests require the `EXPORT_SECRET_TOKEN` environment variable
- All access attempts are logged for security auditing
- The export endpoint respects the configured security measures

## File Naming

Exports are downloaded as: `zeke-backup-YYYY-MM-DD.json`

## Changes from Version 1.0

Version 1.0 only included:
- memories
- preferences
- contacts
- groceryItems
- tasks
- reminders

Version 2.0 adds:
- conversations & messages
- automations & nlAutomations
- profileSections
- twilioMessages
- savedPlaces & placeLists
- folders, documents, uploadedFiles
- journalEntries
- customLists
- meetings & lifelogActionItems
- predictions & patterns
- entities & insights

This provides a truly comprehensive backup of all ZEKE data.
