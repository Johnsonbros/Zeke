# ZEKE Design Guidelines

## Design Approach
**Reference-Based**: ChatGPT web interface + modern messaging apps (Linear, Slack) - focusing on clean conversation flows, minimal chrome, and text-first interaction patterns.

**Core Principles**:
- Conversational focus: Interface disappears, conversation takes center stage
- Dark-optimized: Deep backgrounds with warm accents for comfortable extended use
- Cross-platform continuity: SMS and web feel like the same assistant
- Minimal distraction: No animations, no unnecessary UI elements

---

## Color System (User-Specified)
```
Primary: hsl(9, 75%, 61%)      // Coral red - CTAs, active states
Secondary: hsl(30, 15%, 52%)   // Warm grey - secondary elements
Background: hsl(20, 14%, 4%)   // Deep dark - main canvas
Text: hsl(45, 25%, 91%)        // Warm white - primary text
Accent: hsl(25, 45%, 20%)      // Dark orange - subtle highlights
```

**Color Usage**:
- Background for main canvas and containers
- Text for all body copy and message content
- Primary for send buttons, active chat indicators, user message bubbles
- Secondary for timestamps, metadata, input borders
- Accent for AI message bubbles, subtle hover states

---

## Typography
**Font Family**: Poppins (Google Fonts)

**Type Scale**:
- Display (h1): 2rem / 600 weight - Main heading "ZEKE"
- Heading (h2): 1.25rem / 600 weight - Section headers
- Body: 0.95rem / 400 weight - Message text, default UI
- Small: 0.8rem / 400 weight - Timestamps, metadata
- Tiny: 0.7rem / 400 weight - Helper text

**Line Heights**:
- Display: 1.2
- Body/Messages: 1.6
- UI elements: 1.4

---

## Layout System
**Spacing Units** (Tailwind): Use 2, 4, 6, 8, 12, 16, 20 for consistency
- Tight: p-2, gap-2 (8px) - Icon spacing, tight groups
- Standard: p-4, gap-4 (16px) - Form elements, list items
- Comfortable: p-6, gap-6 (24px) - Message bubbles, cards
- Generous: p-8, gap-8 (32px) - Section padding
- Section: py-12, py-16 (48-64px) - Major section breaks

**Border Radius**: 0.8rem (12.8px) for all rounded elements - message bubbles, inputs, buttons, containers

---

## Component Library

### Chat Interface (Primary View)
**Layout Pattern**: Full-height split (ChatGPT-style)
- Left sidebar (280px): Conversation history list, new chat button, memory/settings access
- Main panel: Message thread with input at bottom
- Mobile: Stack vertically, collapsible sidebar

**Message Bubbles**:
- AI messages: Accent background, left-aligned, max-width 70%, rounded-lg
- User messages: Primary background, right-aligned, max-width 70%, rounded-lg
- Padding: p-4
- Gap between messages: gap-4
- Timestamps: Small text, Secondary color, below bubble

**Input Area**:
- Fixed bottom position with backdrop blur
- Text area with auto-expand (max 6 lines)
- Send button: Primary background, rounded-full icon button
- Border: Secondary color, focus ring Primary
- Padding: p-4 around, p-3 inside textarea

### Sidebar Components
**Conversation List**:
- Each item: p-3, hover Accent/10 background, rounded-lg
- Active conversation: Accent/20 background, Primary left border (3px)
- Title: Body text, truncate
- Preview: Small text, Secondary color, truncate
- Timestamp: Tiny text, Secondary color

**New Chat Button**:
- Full width, Primary background, p-3, rounded-lg
- Icon + "New Chat" text, centered

**Settings/Memory Access**:
- Icon buttons at bottom of sidebar
- Secondary color icons, hover Primary
- p-2, gap-2

### Memory/Profile Panels
**Modal/Drawer Pattern**:
- Slide from right on desktop (400px width)
- Full screen on mobile
- Background with slight transparency over chat
- Close button top-right

**Content Structure**:
- Header: Display size title, p-6
- Sections: py-8, border-t Secondary/20
- Data display: Key-value pairs with Secondary labels, Text values
- Edit mode: Inline inputs matching chat input style

### Empty States
**No Conversation Selected**:
- Centered content in main panel
- Large "ZEKE" in Display size
- Subtitle: "Your personal AI assistant"
- Quick action: "Start a conversation" button (Primary)

---

## Navigation & Controls
**Top Bar** (if needed):
- Minimal height (56px), Background color
- Logo/title left, utility buttons right
- Border-b Secondary/20

**Action Buttons**:
- Primary: Primary background, Text color, rounded-lg, px-6 py-3, hover brightness 110%
- Secondary: Secondary/20 background, Text color, same sizing
- Icon-only: p-2, rounded-full, Secondary color, hover Primary

---

## Responsive Behavior
**Breakpoints**:
- Mobile: < 768px - Stack layout, hide sidebar by default, full-width messages
- Tablet: 768-1024px - Narrow sidebar (240px), 65% max-width messages
- Desktop: > 1024px - Full layout as described

**Mobile Adjustments**:
- Sidebar toggles via hamburger menu
- Messages max-width 85%
- Reduce padding: p-3 instead of p-4
- Smaller type scale (0.9rem body)

---

## Special Considerations
**SMS Context Indicators**:
- Small badge on messages sent/received via SMS
- Icon + "SMS" label in Secondary color
- Positioned top-right of message bubble

**Memory Recall Highlights**:
- When AI references stored memory, subtle Accent/10 background highlight in message
- Optional indicator icon before recalled information

**Loading States**:
- Typing indicator: Three dots animation in Accent color
- Message sending: Reduced opacity (60%) until confirmed
- No spinners - use subtle opacity changes

---

## Accessibility
- Focus visible states: Primary color outline, 2px, offset 2px
- All interactive elements minimum 44x44px touch target
- Keyboard navigation: Tab order logical, Enter to send
- ARIA labels for icon-only buttons
- Sufficient contrast: Text on Background exceeds WCAG AA

---

## Images
No hero images required - this is a functional chat interface, not a marketing page. The interface is text-first and conversational.

**Avatar/Profile Images**:
- AI avatar: Simple "Z" icon in Primary color, circular (32px)
- User avatar: Initials "NJ", circular (32px), Accent background
- Position: Left of AI messages, right of user messages