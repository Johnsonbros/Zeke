# ZEKE Micro-Apps: On-Demand Personal Programs

## Concept Overview

ZEKE can create small, interactive programs ("micro-apps") on the fly for Nate to enjoy during downtime. These apps are lightweight, conversation-driven, and have an automatic lifecycle management system.

**The Vision:** Nate says "Let's play tic-tac-toe" and ZEKE instantly spins up a game. They play together through chat or a simple UI. When done, the app goes into archive. If Nate never plays again for weeks, ZEKE quietly cleans it up.

---

## How It Would Work

### 1. Creation (On-the-Fly)
- Nate requests an activity: "Build a quick trivia game" or "Let's play rock paper scissors"
- ZEKE generates the micro-app code dynamically
- App appears in ZEKE's dashboard under a "Play" or "Activities" section
- No technical knowledge required from Nate

### 2. Interaction Modes
- **Chat-based:** Play directly through conversation ("I choose X in the top-left corner")
- **Visual UI:** Simple interactive interface embedded in dashboard
- **Hybrid:** Visual board with chat commentary from ZEKE

### 3. Archive System
- After a session ends, app moves to "Archive"
- Archived apps can be instantly restored: "Let's play that word game again"
- Archive preserves game state, high scores, preferences

### 4. Auto-Cleanup
- Apps unused for 30+ days get flagged for deletion
- ZEKE asks Nate: "We haven't played Chess in a while. Want to keep it?"
- If no response within a week, app is deleted
- Important memories (high scores, fun moments) are saved to ZEKE's memory before deletion

---

## Example Micro-Apps

### Games
| App | Description | Interaction |
|-----|-------------|-------------|
| Tic-Tac-Toe | Classic 3x3 grid game | Visual + Chat |
| 20 Questions | ZEKE thinks of something, Nate guesses | Chat-only |
| Word Chain | Take turns saying words that start with the last letter | Chat-only |
| Trivia | ZEKE asks questions from various categories | Chat + Score UI |
| Rock Paper Scissors | Quick rounds with score tracking | Chat-only |
| Hangman | Guess the word letter by letter | Visual + Chat |
| Memory Match | Flip cards to find pairs | Visual |

### Productivity Mini-Tools
| App | Description | Interaction |
|-----|-------------|-------------|
| Quick Poll | Nate creates a decision poll, ZEKE helps weigh options | Chat |
| Countdown Timer | Visual timer for focus sessions or cooking | Visual |
| Random Picker | "Pick a restaurant for dinner" from Nate's favorites | Chat |
| Daily Challenge | ZEKE creates a small personal challenge each day | Chat + Tracker |

### Creative
| App | Description | Interaction |
|-----|-------------|-------------|
| Story Builder | Collaborative story, alternating sentences | Chat |
| Name Generator | Generate names for projects, pets, ideas | Chat |
| Quick Sketch Prompt | ZEKE suggests something to draw, Nate describes result | Chat |

---

## Technical Architecture (For ZEKE's Internal Use)

### Micro-App Structure
```
/micro-apps/
  /{app-id}/
    manifest.json      # App metadata, last used, state
    logic.ts           # Game/app logic
    ui.tsx             # Optional visual component
    state.json         # Current game state
```

### Manifest Schema
```json
{
  "id": "tic-tac-toe-001",
  "name": "Tic-Tac-Toe",
  "type": "game",
  "createdAt": "2024-12-19T10:00:00Z",
  "lastUsedAt": "2024-12-19T10:30:00Z",
  "status": "active",
  "interactionMode": "hybrid",
  "preserveOnDelete": ["highScore", "totalGames", "funMoments"]
}
```

### Lifecycle States
1. **Active** - Recently used, ready to play
2. **Archived** - Not used in 7+ days, preserved but dormant
3. **Pending Deletion** - Not used in 30+ days, awaiting confirmation
4. **Deleted** - Removed, key memories saved to ZEKE's long-term memory

### Storage Considerations
- Micro-apps stored in SQLite with the rest of ZEKE's data
- Code templates cached for instant generation
- Total storage cap: ~50 micro-apps max before forced cleanup

---

## Interaction Examples

### Creating a Game
```
Nate: "I'm bored, let's play something"
ZEKE: "How about tic-tac-toe, 20 questions, or word chain? Or I can surprise you."
Nate: "Tic-tac-toe"
ZEKE: "Game's ready! You're X, I'm O. Your move first."
[Visual board appears]
```

### Playing Through Chat
```
Nate: "Top left"
ZEKE: "Nice opener. I'll take center."
[Board updates]
Nate: "Middle left"
ZEKE: "Blocking you... bottom left. Your turn!"
```

### Resuming an Archived Game
```
Nate: "What games do we have saved?"
ZEKE: "We've got:
  - Tic-Tac-Toe (last played 2 weeks ago, you were winning 5-3)
  - 20 Questions (archived, last played a month ago)
  - Trivia (pending deletion - want to keep it?)"
Nate: "Delete trivia, let's play tic-tac-toe"
ZEKE: "Done. Fresh game or continue our rivalry?"
```

### Auto-Cleanup Notification
```
ZEKE: "Hey, we haven't played Hangman in 6 weeks. Want me to keep it around or clean it up? I'll save your best streak (12 words!) either way."
Nate: "Clean it up"
ZEKE: "Gone. Your 12-word streak is saved in my memory though - legend status."
```

---

## Implementation Phases

### Phase 1: Foundation
- Create micro-app storage schema
- Build lifecycle manager (create, archive, delete)
- Implement 2-3 chat-only games (20 Questions, Word Chain, Rock Paper Scissors)

### Phase 2: Visual Games
- Add dashboard section for micro-apps
- Implement visual games (Tic-Tac-Toe, Hangman)
- Build game state persistence

### Phase 3: Smart Features
- Auto-archive after inactivity
- Deletion confirmation flow
- Memory preservation on deletion
- Game suggestions based on mood/time of day

### Phase 4: Expansion
- User-requested game generation
- Score tracking and achievements
- "ZEKE remembers" moments ("Remember when you beat me 5 times in a row?")

---

## Open Questions

1. **Code Generation vs Templates?**
   - Should ZEKE generate app code dynamically using AI, or use pre-built templates?
   - Templates are faster/safer; generation is more flexible

2. **Sandboxing**
   - How to safely run dynamically generated code?
   - Options: iframe isolation, Web Workers, server-side execution

3. **ZEKE's Personality in Games**
   - Should ZEKE play to win, play to entertain, or adapt to Nate's skill?
   - Should ZEKE have playful trash talk?

4. **Storage Limits**
   - How many apps before forced cleanup?
   - Should paid/important apps be exempt from auto-delete?

---

## Summary

This system gives ZEKE and Nate a way to have fun together beyond task management. It's personal, spontaneous, and self-managing. The apps are lightweight enough to spin up instantly but meaningful enough to remember.

The key insight: **ZEKE isn't just an assistant - ZEKE is a companion.** And companions play games together.
