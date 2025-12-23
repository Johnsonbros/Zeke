# Passive Grocery Detection System

**Status**: Planned for ZEKE v2  
**Last Updated**: December 2024  
**Priority**: Phase 3 - Passive Detection

---

## Overview

This system passively listens for grocery-related mentions in daily conversations captured by the OMI pendant, then suggests items to add to the grocery list. It leverages ZEKE's existing batch processing architecture for cost-effective analysis.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     Throughout the Day                          │
│                                                                 │
│  OMI Pendant captures conversations:                           │
│  - "We're out of milk"                                         │
│  - "Need to pick up eggs tomorrow"                             │
│  - "I'm making pasta tonight, do we have garlic?"              │
│  - "Running low on coffee"                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    3 AM Batch Processing                        │
│                                                                 │
│  grocery-items-extraction job:                                  │
│  1. Fetch day's OMI transcripts                                │
│  2. AI analyzes for food-related mentions                      │
│  3. Extract items with confidence scores                       │
│  4. Deduplicate against existing grocery list                  │
│  5. Store as "suggested" items                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Morning Briefing (6 AM)                      │
│                                                                 │
│  "Good morning Nate! Yesterday you mentioned being out of      │
│   milk and needing eggs. Should I add these to your grocery    │
│   list?"                                                        │
│                                                                 │
│  [Add All]  [Review Items]  [Dismiss]                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detection Patterns

### High Confidence Triggers
These phrases directly indicate a need to purchase:

| Pattern | Example | Confidence |
|---------|---------|------------|
| "out of [item]" | "We're out of milk" | 0.95 |
| "need to get [item]" | "I need to get eggs" | 0.90 |
| "need to buy [item]" | "Need to buy bread" | 0.95 |
| "running low on [item]" | "Running low on coffee" | 0.85 |
| "should pick up [item]" | "Should pick up cheese" | 0.85 |
| "add [item] to the list" | "Add bananas to the list" | 0.98 |
| "don't have any [item]" | "We don't have any butter" | 0.90 |
| "forgot to buy [item]" | "Forgot to buy onions" | 0.90 |

### Medium Confidence Triggers
These may indicate a need but require context:

| Pattern | Example | Confidence |
|---------|---------|------------|
| "do we have [item]" | "Do we have garlic?" | 0.60 |
| "is there any [item]" | "Is there any yogurt left?" | 0.55 |
| "making [dish]" + ingredient | "Making pasta, need tomatoes" | 0.70 |
| "recipe needs [item]" | "This recipe needs cilantro" | 0.75 |

### Wake Word Commands (Real-time)
These bypass batch processing for immediate action:

| Trigger | Action |
|---------|--------|
| "Hey ZEKE, add [item] to grocery list" | Immediate add |
| "Hey ZEKE, we need [item]" | Immediate add |
| "ZEKE, put [item] on the list" | Immediate add |

---

## Data Model

### Suggested Grocery Items Table

```typescript
// shared/schema.ts addition

export const suggestedGroceryItems = sqliteTable('suggested_grocery_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').default('Other'),
  quantity: text('quantity').default('1'),
  confidence: real('confidence').notNull(),        // 0.0 - 1.0
  sourceTranscript: text('source_transcript'),     // Snippet of conversation
  sourceTimestamp: text('source_timestamp'),       // When it was said
  status: text('status').default('pending'),       // pending, approved, dismissed
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  reviewedAt: text('reviewed_at'),
});
```

### Batch Job Result Storage

```typescript
// Stored in batch_job_results table
interface GroceryExtractionResult {
  jobType: 'grocery-items-extraction';
  processedTranscripts: number;
  extractedItems: Array<{
    name: string;
    category: string;
    quantity: string;
    confidence: number;
    sourceSnippet: string;
    timestamp: string;
  }>;
  duplicatesSkipped: number;
  newSuggestions: number;
}
```

---

## Batch Job Implementation

### Job Template

```typescript
// server/jobs/groceryExtraction.ts

import { getBatchJobTemplate } from '../services/batchJobOrchestrator';
import { getOmiTranscriptsForDate } from '../db';
import { createSuggestedGroceryItem, getGroceryItems } from '../db';

export const groceryExtractionTemplate = getBatchJobTemplate({
  jobType: 'grocery-items-extraction',
  schedule: 'nightly',  // Runs at 3 AM with other batch jobs
  
  async buildPrompt(context: BatchContext): Promise<string> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const transcripts = await getOmiTranscriptsForDate(yesterday);
    const existingItems = await getGroceryItems();
    const existingNames = existingItems.map(i => i.name.toLowerCase());
    
    return `
You are analyzing conversation transcripts to identify grocery items that need to be purchased.

## Existing Grocery List (do not suggest duplicates):
${existingNames.join(', ') || 'Empty list'}

## Today's Conversation Transcripts:
${transcripts.map(t => `[${t.timestamp}] ${t.text}`).join('\n\n')}

## Instructions:
1. Identify any mentions of food items that need to be purchased
2. Look for phrases like "out of", "need to get", "running low on", etc.
3. Extract the specific food item name
4. Assign a confidence score (0.0-1.0) based on how certain you are they need this item
5. Categorize each item (Produce, Dairy, Meat, Bakery, Frozen, Pantry, Beverages, Snacks, Other)
6. Skip items already on the grocery list

## Response Format (JSON):
{
  "extractedItems": [
    {
      "name": "milk",
      "category": "Dairy",
      "quantity": "1 gallon",
      "confidence": 0.95,
      "sourceSnippet": "We're completely out of milk",
      "timestamp": "2024-12-22T14:30:00Z",
      "reasoning": "Direct statement about being out of milk"
    }
  ],
  "summary": "Found 2 grocery items mentioned in today's conversations"
}
`;
  },

  async processResult(result: any, context: BatchContext): Promise<void> {
    const { extractedItems } = result;
    
    for (const item of extractedItems) {
      // Only add items with reasonable confidence
      if (item.confidence >= 0.6) {
        await createSuggestedGroceryItem({
          id: generateUUID(),
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          confidence: item.confidence,
          sourceTranscript: item.sourceSnippet,
          sourceTimestamp: item.timestamp,
          status: 'pending'
        });
      }
    }
    
    console.log(`[GroceryExtraction] Added ${extractedItems.length} suggested items`);
  }
});
```

### Integration with Morning Briefing

```typescript
// server/jobs/morningBriefing.ts addition

async function buildGrocerySuggestionSection(): Promise<string> {
  const pendingSuggestions = await getPendingSuggestedGroceryItems();
  
  if (pendingSuggestions.length === 0) {
    return '';
  }
  
  const itemList = pendingSuggestions
    .map(s => `- ${s.name} (${s.category}) - "${s.sourceTranscript}"`)
    .join('\n');
  
  return `
## Grocery Suggestions

Yesterday you mentioned needing these items:
${itemList}

Would you like me to add them to your grocery list?
`;
}
```

---

## API Endpoints

### Get Pending Suggestions

```typescript
// GET /api/grocery/suggestions
app.get('/api/grocery/suggestions', async (req, res) => {
  const suggestions = await getPendingSuggestedGroceryItems();
  res.json({ suggestions });
});
```

### Approve/Dismiss Suggestions

```typescript
// POST /api/grocery/suggestions/:id/approve
app.post('/api/grocery/suggestions/:id/approve', async (req, res) => {
  const { id } = req.params;
  const suggestion = await getSuggestedGroceryItem(id);
  
  if (!suggestion) {
    return res.status(404).json({ error: 'Suggestion not found' });
  }
  
  // Add to actual grocery list
  await addGroceryItem({
    name: suggestion.name,
    category: suggestion.category,
    quantity: suggestion.quantity,
    addedBy: 'ZEKE (suggested)',
    purchased: false
  });
  
  // Mark suggestion as approved
  await updateSuggestedGroceryItem(id, { status: 'approved', reviewedAt: new Date() });
  
  res.json({ success: true });
});

// POST /api/grocery/suggestions/:id/dismiss
app.post('/api/grocery/suggestions/:id/dismiss', async (req, res) => {
  const { id } = req.params;
  await updateSuggestedGroceryItem(id, { status: 'dismissed', reviewedAt: new Date() });
  res.json({ success: true });
});

// POST /api/grocery/suggestions/approve-all
app.post('/api/grocery/suggestions/approve-all', async (req, res) => {
  const suggestions = await getPendingSuggestedGroceryItems();
  
  for (const suggestion of suggestions) {
    await addGroceryItem({
      name: suggestion.name,
      category: suggestion.category,
      quantity: suggestion.quantity,
      addedBy: 'ZEKE (suggested)',
      purchased: false
    });
    await updateSuggestedGroceryItem(suggestion.id, { status: 'approved', reviewedAt: new Date() });
  }
  
  res.json({ success: true, count: suggestions.length });
});
```

---

## Frontend UI

### Suggestions Panel in Grocery Page

```tsx
// client/src/components/GrocerySuggestions.tsx

function GrocerySuggestions() {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['/api/grocery/suggestions']
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/grocery/suggestions/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/grocery'] })
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/grocery/suggestions/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/grocery/suggestions'] })
  });

  if (!suggestions?.length) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          Suggested Items
        </CardTitle>
        <CardDescription>
          Based on your conversations yesterday
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-2 rounded-md border">
              <div>
                <span className="font-medium">{s.name}</span>
                <Badge variant="outline" className="ml-2">{s.category}</Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  "{s.sourceTranscript}"
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => approveMutation.mutate(s.id)}>
                  <Check className="w-4 h-4 text-green-500" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => dismissMutation.mutate(s.id)}>
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button 
          className="w-full mt-3" 
          variant="outline"
          onClick={() => approveAllMutation.mutate()}
        >
          Add All to List
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## SMS Integration

### Morning Briefing with Grocery Suggestions

```typescript
// Include in 6 AM morning briefing SMS

const pendingSuggestions = await getPendingSuggestedGroceryItems();

if (pendingSuggestions.length > 0) {
  const itemNames = pendingSuggestions.map(s => s.name).join(', ');
  
  briefingMessage += `\n\nGrocery: Yesterday you mentioned needing ${itemNames}. ` +
    `Reply "ADD ALL" to add to your list, or check the app to review.`;
}
```

### SMS Commands

| Command | Action |
|---------|--------|
| "ADD ALL" | Approve all pending grocery suggestions |
| "ADD [item]" | Add specific item from suggestions |
| "DISMISS ALL" | Clear all pending suggestions |

---

## Cost Efficiency

This system is designed for maximum cost efficiency:

| Aspect | Approach | Savings |
|--------|----------|---------|
| **Processing** | Batch API at 3 AM | 50% vs real-time |
| **Deduplication** | Check existing list before suggesting | Avoid redundant suggestions |
| **Confidence threshold** | Only suggest items >= 0.6 confidence | Reduce noise |
| **Caching** | Cache category mappings | Reduce API calls |

---

## Future Enhancements

1. **Learning from corrections**: If user dismisses a suggestion, reduce confidence for similar patterns
2. **Household context**: Understand that "we need milk" applies to the household
3. **Recipe integration**: When discussing a recipe, auto-suggest missing ingredients
4. **Smart timing**: Suggest items before typical shopping days (e.g., Saturday morning)
5. **Price awareness**: Note if items are on sale at preferred stores

---

*Document prepared for ZEKE v2 development - December 2024*
