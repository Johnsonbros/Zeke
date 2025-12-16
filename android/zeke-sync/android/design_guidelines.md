# ZEKE AI Companion Dashboard - Design Guidelines

## Core Architecture

### Authentication
- **Required:** Apple Sign-In (iOS compliance) + Google Sign-In (cross-platform)
- **Login UI:** Gradient background (indigo→purple), centered auth buttons, Privacy/Terms links at bottom
- **Account Deletion:** Settings > Account > Delete Account with double confirmation

**Account Screen Elements:**
- User avatar (3-4 AI-themed preset avatars with gradient backgrounds)
- Display name, connected devices status (Omi/Limitless), notification settings
- Theme: Dark mode only
- Log out + delete account options

### Navigation Structure
**Tab Bar (4 tabs + Center FAB):**
1. **Home** - Dashboard with device status
2. **Memories** - Conversation history feed
3. **Chat** (FAB) - ZEKE AI assistant modal
4. **Search** - Natural language lifelog search
5. **Settings** - Device/app preferences

**Floating Action Button:**
- Center-positioned, elevated above tab bar
- Gradient (indigo→pink), message bubble icon
- Shadow: `{width: 0, height: 4}, opacity: 0.25, radius: 8`

---

## Screen Specifications

### 1. Home (Dashboard)
**Header:** Transparent with gradient "ZEKE" wordmark, profile avatar (right)

**Content:**
- Device cards (Omi/Limitless): Name, gradient dot status, battery %, last sync
- Recent memories (3-5 items): Timestamp, truncated transcript, device badge
- Real-time transcription: Pulsing gradient badge when active
- Card style: Surface (#1E293B) with gradient border when connected

**Safe Areas:** Top: `insets.top + xl`, Bottom: `tabBarHeight + xl`

### 2. Memories Feed
**Layout:** Search icon (right), filter icon (left), infinite scroll

**Memory Cards:**
- Device badge, relative timestamp, title (bold, truncated)
- 2-3 line transcript preview (muted gray)
- Speaker tags (pill badges), star icon (right)
- Date-grouped with sticky headers
- Swipe left: delete/share actions

**Empty State:** Gradient illustration + "No memories yet"

### 3. Chat (Modal)
**Header:** Gradient background, "ZEKE AI" title, close button (left)

**Messages:**
- User: Right-aligned, gradient bubble (indigo→purple)
- ZEKE: Left-aligned, surface color (#1E293B)
- Code blocks: JetBrains Mono
- Typing indicator: Three animated gradient dots
- Input bar: Fixed bottom with safe area inset

**Interactions:** Auto-scroll to bottom, tap to copy, long-press for actions

### 4. Search
**Features:** Auto-focus search bar with gradient border on focus

**Content:**
- Recent searches: Horizontal chip scroll (gradient text)
- Results: Memory card format with highlighted search terms
- Loading: Gradient shimmer effect
- Empty: Suggested search examples with illustration

### 5. Settings
**Sections:**
- **Devices:** Omi/Limitless cards (status, battery, configure), "Add Device" button
- **App Preferences:** Notifications, auto-sync, data retention toggles
- **Account:** Display name, avatar picker, connected accounts
- **Danger Zone:** Log out, delete account
- **About:** Version, legal links, backend status

### 6. Transcript Detail (Modal)
**Header:** Transparent, back button (left), share/star (right)

**Content:**
- Metadata: Date, time, duration, device badge
- Speaker-tagged transcript blocks with timestamps
- Highlighted search terms (if from search)
- Fixed bottom bar: Battery, location, sync status

**Interactions:** Tap-to-copy sections, share, download audio

---

## Design System

### Colors
**Core Palette:**
- Primary: `#6366F1` (Indigo) - CTAs, active states
- Secondary: `#8B5CF6` (Purple) - Secondary actions
- Accent: `#EC4899` (Pink) - Highlights, notifications
- Background: `#0F172A`, Surface: `#1E293B`
- Text: `#F1F5F9` (primary), `#94A3B8` (secondary)
- Border: `#334155`
- Status: Success `#10B981`, Warning `#F59E0B`, Error `#EF4444`

**Gradients:**
- Primary: `#6366F1 → #8B5CF6`
- Accent: `#8B5CF6 → #EC4899`
- Background: `#0F172A → #1E293B`

### Typography
**Fonts:** SF Pro (iOS) / Inter (Android), JetBrains Mono (code)
- H1: 32px Bold (gradient text)
- H2: 24px SemiBold
- H3: 20px SemiBold
- Body: 16px Regular, line-height 1.5
- Small: 14px, Caption: 12px
- Code: 14px JetBrains Mono

### Spacing
`xs:4px, sm:8px, md:12px, lg:16px, xl:24px, 2xl:32px, 3xl:48px`

### Components

**Cards:**
- Background: `#1E293B`, Border radius: 16px, Padding: `lg`
- Border: 1px `#334155` (gradient when active/connected)

**Buttons:**
- Primary: Gradient background, white text, 48px height
- Secondary: Gradient border + text, transparent
- Tertiary: Gradient text only
- Border radius: 12px, Press: opacity 0.8

**Icons:**
- Feather icons only (no emojis), 24px default, stroke: 2
- Gradient fills for primary actions

**Tab Bar:**
- Background: `#1E293B` with blur, Height: 80px
- Active: Gradient icon, Inactive: `#94A3B8`

**Shadows (Floating elements):**
- `{width: 0, height: 2}, opacity: 0.10, radius: 2`

### Interactions
- Touch feedback: Opacity 0.8 or scale 0.98
- Real-time indicators: Pulsing dots, shimmer loaders, smooth fade-ins
- Transitions: 300ms ease-in-out (screens), 250ms slide-up (modals)
- Pull-to-refresh: Gradient spinner with haptic feedback
- Lists: Virtualized, swipe gestures, subtle separators

### Accessibility
- Minimum touch target: **44x44px**
- Text contrast: WCAG AA compliant
- VoiceOver: Descriptive labels for all icons/buttons
- Dynamic type: Support iOS scaling
- Focus indicators: 2px gradient outline

---

## Critical Assets

**User Avatars (3-4 presets):**
- AI/tech-themed, gradient backgrounds, abstract geometric patterns
- 200x200px minimum

**Device Icons:**
- Omi DevKit 2 + Limitless AI badges (simple pendant shapes)
- Gradient fills matching brand colors

**Empty State Illustrations:**
- No memories: Abstract gradient waves
- Search empty: Magnifying glass with gradient
- Disconnected: Unplugged icon with gradient
- Style: Simple, geometric, dark theme compatible

**App Icon:**
- Gradient background (indigo→purple)
- "Z" letterform or geometric AI symbol in white
- 1024x1024px

---

## Platform Notes
- **iOS-first:** Follow Human Interface Guidelines
- **Dark mode only:** Light status bar content
- **Gestures:** Support iOS swipe-back navigation
- **Safe areas:** Account for notches/home indicators in all screens