# Project Plan: Multi-Modal Understanding
## ZEKE Sees, Hears, and Understands Nate's World in Real-Time

### Vision

ZEKE processes multiple types of input - images, voice, documents, screens, and ambient audio - to understand Nate's world in rich detail. This transforms ZEKE from text-only to fully aware of Nate's physical and digital environment.

---

## Current State (What ZEKE Has Now)

### Existing Components

| Component | Location | What It Does |
|-----------|----------|--------------|
| `fileProcessor.ts` | `server/services/` | GPT-4o vision for images, PDF text extraction, MMS image analysis |
| `transcriber.ts` | `server/voice/` | Whisper API transcription for audio chunks |
| `omi.ts` | `server/` | Omi pendant lifelog ingestion and processing |
| `omiListener.ts` | `server/voice/` | Real-time Omi websocket connection |

### Current Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      IMAGE PROCESSING                        │
└─────────────────────────────────────────────────────────────┘

MMS/Upload → fileProcessor.ts → GPT-4o Vision
                    │
                    ▼
            analyzeImage() / analyzeImageFromUrl()
                    │
                    ▼
            ┌───────────────────────────────────────┐
            │ ImageAnalysisResult:                  │
            │  • description                        │
            │  • extractedText (OCR)                │
            │  • objects[]                          │
            │  • tags[]                             │
            │  • personAnalysis (if people present) │
            │    - peopleCount                      │
            │    - peopleDescriptions[]             │
            │    - setting, occasion                │
            │    - suggestedMemory                  │
            └───────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      PDF PROCESSING                          │
└─────────────────────────────────────────────────────────────┘

PDF Upload → extractPdfText() → pdf-parse library
                    │
                    ▼
            ┌───────────────────────────────────────┐
            │ PdfExtractionResult:                  │
            │  • text (full extracted text)         │
            │  • pageCount                          │
            │  • info (title, author, subject)      │
            └───────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      VOICE PROCESSING                        │
└─────────────────────────────────────────────────────────────┘

Audio → WhisperTranscriber → OpenAI Whisper API
                    │
                    ▼
            ┌───────────────────────────────────────┐
            │ TranscriptionResult:                  │
            │  • text                               │
            │  • startMs, endMs, durationMs         │
            │  • confidence (optional)              │
            └───────────────────────────────────────┘
```

### Current Capabilities (Code Examples)

**Image Analysis (from `fileProcessor.ts`):**
```typescript
// Currently handles:
export async function analyzeImageFromUrl(
  imageUrl: string,
  context?: { senderName?: string; senderPhone?: string; messageText?: string }
): Promise<ImageAnalysisResult & { personAnalysis?: PersonPhotoAnalysisResult }>

// Returns:
{
  description: "A restaurant menu with Italian dishes...",
  extractedText: "Spaghetti Carbonara $18...",
  objects: ["menu", "table", "wine glass"],
  tags: ["restaurant", "dining", "italian"],
  personAnalysis: {
    hasPeople: true,
    peopleCount: 2,
    peopleDescriptions: [...],
    setting: "Italian restaurant",
    occasion: "dinner date"
  }
}
```

**PDF Extraction (from `fileProcessor.ts`):**
```typescript
export async function extractPdfText(fileId: string): Promise<PdfExtractionResult>

// Returns:
{
  text: "Contract Agreement between...",
  pageCount: 12,
  info: { title: "Service Agreement", author: "Legal Dept" }
}
```

**Audio Transcription (from `transcriber.ts`):**
```typescript
export class WhisperTranscriber implements Transcriber {
  async transcribeChunk(chunk: AudioChunk): Promise<TranscriptionResult | null>
}

// Returns:
{
  text: "Hey, I wanted to talk about the project deadline...",
  startMs: 0,
  endMs: 45000,
  durationMs: 45000
}
```

---

## What's Missing (The Gap)

### 1. Smart Document Analysis

**Current:** Extracts text from PDFs.

**Missing:** Analyzes documents semantically, identifies key terms, compares documents, flags concerns.

| Current Output | Missing Capability |
|----------------|-------------------|
| `text: "Contract Agreement..."` | "This is a 12-month service contract. Key terms: $2,500/month, 60-day cancellation. Concerns: Broad liability clause in section 8.2" |

### 2. Context-Aware Image Understanding

**Current:** Describes what's in an image.

**Missing:** Connects image content to Nate's preferences, history, and context.

| Current Output | Missing Capability |
|----------------|-------------------|
| `description: "Restaurant menu with Italian dishes"` | "Based on your preferences: Try the salmon (you love fish). Avoid the burger (has chipotle aioli you don't like)." |

### 3. Meeting Summarization

**Current:** Transcribes audio.

**Missing:** Structures meeting content with action items, decisions, speaker attribution.

| Current Output | Missing Capability |
|----------------|-------------------|
| `text: "Hey, I wanted to talk about..."` | `{ summary, decisions: [...], actionItems: [...], speakers: [...], openQuestions: [...] }` |

### 4. Real-Time Awareness

**Current:** Processes media when explicitly sent.

**Missing:** Browser extension, screen sharing, ambient awareness.

---

## Implementation Plan

### Phase 1: Smart Document Analysis (Extend Existing)

**Extend `fileProcessor.ts`:**

```typescript
// NEW: Add to fileProcessor.ts

export interface DocumentAnalysisResult {
  documentType: 'contract' | 'invoice' | 'report' | 'article' | 'form' | 'other';
  summary: string;
  keyPoints: string[];
  concerns: string[];
  actionItems: string[];
  metadata: {
    parties?: string[];
    dates?: string[];
    amounts?: string[];
    deadlines?: string[];
  };
  comparisonNotes?: string; // If comparing to another document
}

export async function analyzeDocument(
  fileId: string,
  context?: { purpose?: string; compareToFileId?: string }
): Promise<DocumentAnalysisResult> {
  const file = getUploadedFile(fileId);
  if (!file) throw new Error(`File not found: ${fileId}`);
  
  // Get text content (use existing extraction)
  const textContent = file.extractedText || (await extractPdfText(fileId)).text;
  
  // If comparing, get other document too
  let comparisonText = '';
  if (context?.compareToFileId) {
    const compareFile = getUploadedFile(context.compareToFileId);
    comparisonText = compareFile?.extractedText || '';
  }
  
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a document analyst. Analyze this document and extract:
        1. Document type (contract, invoice, report, article, form, other)
        2. Concise summary (2-3 sentences)
        3. Key points (important facts, terms, or information)
        4. Concerns (anything unusual, risky, or requiring attention)
        5. Action items (what the reader needs to do)
        6. Metadata (parties involved, dates, amounts, deadlines)
        ${comparisonText ? '7. Compare to the second document provided' : ''}
        
        Be specific and actionable. Flag anything a non-lawyer should have reviewed.`
      },
      {
        role: "user",
        content: `Analyze this document${context?.purpose ? ` (purpose: ${context.purpose})` : ''}:

DOCUMENT:
${textContent.substring(0, 15000)}
${comparisonText ? `\n\nCOMPARE TO:\n${comparisonText.substring(0, 10000)}` : ''}

Respond in JSON format.`
      }
    ],
    max_tokens: 2000,
    response_format: { type: "json_object" }
  });
  
  return JSON.parse(response.choices[0]?.message?.content || '{}');
}
```

**Add API route:**

```typescript
// Add to routes.ts

app.post("/api/files/:fileId/analyze", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { purpose, compareToFileId } = req.body;
    const analysis = await analyzeDocument(fileId, { purpose, compareToFileId });
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: "Document analysis failed" });
  }
});
```

### Phase 2: Context-Aware Image Understanding (Extend Existing)

**Extend `fileProcessor.ts`:**

```typescript
// NEW: Add to fileProcessor.ts

import { searchMemories } from "./semanticMemory";
import { getFoodPreferences } from "./db";

export interface ContextualImageAnalysis extends ImageAnalysisResult {
  personalizedInsights?: {
    recommendations: string[];
    warnings: string[];
    memories: string[]; // Related memories
  };
}

export async function analyzeImageWithContext(
  imageUrl: string,
  context?: { 
    senderName?: string; 
    messageText?: string;
    includePreferences?: boolean;
  }
): Promise<ContextualImageAnalysis> {
  // Get base analysis (existing function)
  const baseAnalysis = await analyzeImageFromUrl(imageUrl, context);
  
  // If it's a menu or food-related, add preference context
  if (baseAnalysis.tags?.some(t => ['menu', 'food', 'restaurant', 'dining'].includes(t))) {
    const preferences = await getFoodPreferences();
    const personalizedInsights = await generateFoodInsights(baseAnalysis, preferences);
    return { ...baseAnalysis, personalizedInsights };
  }
  
  // If people are detected, check for known contacts
  if (baseAnalysis.personAnalysis?.hasPeople) {
    const relatedMemories = await searchMemories(
      baseAnalysis.description,
      { limit: 3 }
    );
    return {
      ...baseAnalysis,
      personalizedInsights: {
        recommendations: [],
        warnings: [],
        memories: relatedMemories.map(m => m.content)
      }
    };
  }
  
  return baseAnalysis;
}

async function generateFoodInsights(
  analysis: ImageAnalysisResult,
  preferences: FoodPreference[]
): Promise<ContextualImageAnalysis['personalizedInsights']> {
  const likes = preferences.filter(p => p.preference === 'like').map(p => p.item);
  const dislikes = preferences.filter(p => p.preference === 'dislike').map(p => p.item);
  const allergies = preferences.filter(p => p.preference === 'allergy').map(p => p.item);
  
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Given a menu/food image analysis and user preferences, provide:
        1. Recommendations (items they'd likely enjoy)
        2. Warnings (items to avoid based on dislikes/allergies)
        Be specific about which menu items match preferences.`
      },
      {
        role: "user",
        content: `Image analysis: ${JSON.stringify(analysis)}
        
User preferences:
- Likes: ${likes.join(', ') || 'none specified'}
- Dislikes: ${dislikes.join(', ') || 'none specified'}
- Allergies: ${allergies.join(', ') || 'none specified'}

Respond in JSON: { recommendations: [...], warnings: [...] }`
      }
    ],
    max_tokens: 500
  });
  
  const result = JSON.parse(response.choices[0]?.message?.content || '{}');
  return { ...result, memories: [] };
}
```

### Phase 3: Meeting Summarization (Extend Existing)

**Create `server/services/meetingProcessor.ts`:**

```typescript
// NEW FILE: server/services/meetingProcessor.ts

import OpenAI from "openai";
import { WhisperTranscriber } from "../voice/transcriber";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface MeetingSummary {
  title: string;
  duration: number; // seconds
  participants: string[];
  summary: string;
  keyDecisions: string[];
  actionItems: Array<{
    task: string;
    assignee?: string;
    deadline?: string;
  }>;
  openQuestions: string[];
  followUps: string[];
  transcript?: string;
}

export async function processMeetingAudio(
  audioBuffer: Buffer,
  context?: { title?: string; expectedParticipants?: string[] }
): Promise<MeetingSummary> {
  // 1. Transcribe audio
  const transcriber = new WhisperTranscriber();
  const chunk = {
    startMs: 0,
    endMs: audioBuffer.length * 8, // Rough estimate
    data: audioBuffer
  };
  const transcription = await transcriber.transcribeChunk(chunk);
  
  if (!transcription?.text) {
    throw new Error("Failed to transcribe audio");
  }
  
  // 2. Analyze transcript for meeting structure
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a meeting analyst. Extract structured information from this meeting transcript:
        1. Identify distinct speakers (label as Speaker 1, Speaker 2, etc. or use names if mentioned)
        2. Summarize the main discussion points
        3. List any decisions that were made
        4. Extract action items with assignees and deadlines if mentioned
        5. Note any open questions that weren't resolved
        6. Suggest follow-ups`
      },
      {
        role: "user",
        content: `Meeting transcript${context?.title ? ` (${context.title})` : ''}:
${transcription.text}

${context?.expectedParticipants ? `Expected participants: ${context.expectedParticipants.join(', ')}` : ''}

Respond in JSON format with: title, participants[], summary, keyDecisions[], actionItems[{task, assignee?, deadline?}], openQuestions[], followUps[]`
      }
    ],
    max_tokens: 2000,
    response_format: { type: "json_object" }
  });
  
  const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');
  
  return {
    ...analysis,
    duration: transcription.durationMs / 1000,
    transcript: transcription.text
  };
}

export async function processMeetingFromUrl(
  audioUrl: string,
  context?: { title?: string; expectedParticipants?: string[] }
): Promise<MeetingSummary> {
  // Download audio
  const response = await fetch(audioUrl);
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  
  return processMeetingAudio(audioBuffer, context);
}
```

**Add API routes:**

```typescript
// Add to routes.ts

app.post("/api/meetings/analyze", upload.single('audio'), async (req, res) => {
  try {
    const { title, participants } = req.body;
    const audioBuffer = req.file?.buffer;
    
    if (!audioBuffer) {
      return res.status(400).json({ error: "Audio file required" });
    }
    
    const summary = await processMeetingAudio(audioBuffer, {
      title,
      expectedParticipants: participants ? JSON.parse(participants) : undefined
    });
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: "Meeting analysis failed" });
  }
});
```

### Phase 4: Integration with Memory System

**Connect multi-modal processing to memory:**

```typescript
// Add to fileProcessor.ts

import { createMemory } from "../db";

export async function processAndRememberImage(
  fileId: string,
  context?: { source: string; }
): Promise<void> {
  const analysis = await analyzeImage(fileId);
  
  // Create memory from image if significant
  if (analysis.personAnalysis?.suggestedMemory) {
    await createMemory({
      content: analysis.personAnalysis.suggestedMemory,
      category: "visual",
      source: context?.source || "image_upload",
      metadata: JSON.stringify({
        fileId,
        hasImage: true,
        people: analysis.personAnalysis.peopleDescriptions,
        setting: analysis.personAnalysis.setting
      })
    });
  }
}

export async function processAndRememberMeeting(
  audioBuffer: Buffer,
  context?: { title?: string; source?: string }
): Promise<MeetingSummary> {
  const summary = await processMeetingAudio(audioBuffer, context);
  
  // Create memory from meeting
  await createMemory({
    content: `Meeting: ${summary.title}\n\nSummary: ${summary.summary}\n\nDecisions: ${summary.keyDecisions.join('; ')}\n\nAction items: ${summary.actionItems.map(a => a.task).join('; ')}`,
    category: "meeting",
    source: context?.source || "audio_upload",
    metadata: JSON.stringify({
      participants: summary.participants,
      actionItems: summary.actionItems,
      duration: summary.duration
    })
  });
  
  // Create tasks from action items
  for (const item of summary.actionItems) {
    if (item.assignee === 'Nate' || !item.assignee) {
      await createTask({
        title: item.task,
        category: "meeting_action",
        dueDate: item.deadline,
        source: `Meeting: ${summary.title}`
      });
    }
  }
  
  return summary;
}
```

---

## Concrete Examples

### Before (Current)

```
[Nate sends a menu photo via MMS]
ZEKE: "This is a menu from an Italian restaurant. I can see 
pasta dishes, wine list, and appetizers. The lighting suggests 
an evening setting."
```

### After (With Context-Aware Understanding)

```
[Nate sends a menu photo via MMS]
ZEKE: "Nice Italian place! Based on your preferences:

RECOMMENDED:
- Grilled salmon with herbs (you love fish, lighter option)
- Truffle risotto (you've liked risotto before)

AVOID:
- The burger has chipotle aioli (you don't like spicy mayo)
- Shrimp dishes (your mild shellfish sensitivity)

The pasta portions look generous - might want to share or 
take home. Want me to check reviews for this place?"
```

### Before (Current - PDF)

```
[Nate uploads a contract]
ZEKE: "I extracted the text from your 12-page PDF. 
Title: Service Agreement. Author: Legal Dept."
```

### After (With Smart Document Analysis)

```
[Nate uploads a contract]
ZEKE: "I've reviewed the contract. Here's what matters:

SUMMARY: 12-month service agreement with TechCorp

KEY TERMS:
- Monthly fee: $2,500
- 60-day cancellation notice required
- Auto-renews unless cancelled 30 days before end

CONCERNS:
- Section 8.2 has a broad liability clause
- Data ownership clause (5.4) says they retain aggregate data rights
- Late payment penalty is steep (15% + collection fees)

ACTION ITEMS:
- Review section 8.2 with legal
- Negotiate data ownership terms
- Add calendar reminder for cancellation window

Want me to highlight the specific sections?"
```

---

## Files to Modify/Create

| File | Action | Changes |
|------|--------|---------|
| `server/services/fileProcessor.ts` | Modify | Add `analyzeDocument()`, `analyzeImageWithContext()` |
| `server/services/meetingProcessor.ts` | Create | New file for meeting summarization |
| `server/routes.ts` | Modify | Add document analysis and meeting endpoints |
| `shared/schema.ts` | Modify | Add meeting summary types if storing |

---

## Success Metrics

| Metric | How to Measure |
|--------|----------------|
| Document analysis accuracy | Manual review of key terms extracted |
| Menu recommendation relevance | User follows suggestions |
| Meeting action item capture | Items match what user recalls |
| Processing speed | Time from upload to analysis complete |

---

## Summary

The current system has strong foundations for image analysis, PDF extraction, and audio transcription. The enhancement path is:

1. **Add intelligence to documents** - Go beyond text extraction to semantic analysis
2. **Personalize image understanding** - Connect to preferences and memories
3. **Structure audio content** - Transform transcripts into actionable meeting summaries
4. **Remember what's processed** - Auto-create memories and tasks from media

This transforms ZEKE from a media processor into a contextual understanding engine.
