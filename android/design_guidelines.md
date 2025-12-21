# ZEKE AI Companion Dashboard - Design Guidelines

## Platform Focus: Android (Pixel 8)

This app is designed specifically for **Android Pixel 8** devices, following **Google Material Design 3** principles while maintaining the ZEKE brand identity.

### Target Device Specifications
- **Device:** Google Pixel 8
- **Screen:** 6.2" OLED, 1080 x 2400 pixels (20:9 ratio)
- **Density:** 428 ppi (~2.75x density)
- **Status bar height:** 24dp
- **Navigation bar height:** 48dp
- **Safe area considerations:** Punch-hole camera cutout (top-left)

---

## ZEKE Branding System

### Header Components

**Main Tab Screens (Home, Comms, Calendar, Geo, Tasks):**
Uses `ZekeHeaderTitle` component with `ZekeHeaderButtons`:
- **Left side:** App icon (36x36dp, 8dp border radius) + "ZEKE" title (22sp, bold, primary color) + connection status indicator (animated pulsing dot when online)
- **Right side:** Chat button (message-circle icon, accent color background) + Settings button (settings icon, muted background)
- Both buttons are 40x40dp circular with semi-transparent backgrounds
- Container padding: 12dp on left and right

**Sub-Screens (Settings, Notifications, Contact Detail, etc.):**
Uses `ZekeSubHeader` component:
- **Center:** App icon (24x24dp, 6dp border radius) + "ZEKE" text (14sp, bold, primary color) + vertical separator (1px, border color) + Screen title (16sp, semibold)
- Back arrow on left (system default)

**Modal Screens (Chat, SmsCompose):**
- Standard modal presentation with close button
- Title reflects screen purpose

### Connection Status Indicator
- **Online:** Green pulsing dot (`#10B981`) with animated scale/opacity pulse
- **Offline:** Red static dot (`#EF4444`)
- Status text: 10sp, semibold, matching dot color

---

## Navigation Structure

### Bottom Tab Navigator (5 tabs)
1. **Home** (home icon) - Dashboard with device status and quick actions
2. **Comms** (phone icon) - Communications hub (SMS, Voice, Chat, Contacts)
3. **Calendar** (calendar icon) - Schedule and events with Google Calendar sync
4. **Geo** (map-pin icon) - Location tracking and geofencing
5. **Tasks** (check-square icon) - Tasks, Grocery, and Custom Lists

### Tab Bar Specifications (Android/Material Design 3)
- **Height:** 80dp + safe area bottom padding (minimum 16dp)
- **Background:** `#1E293B` (backgroundDefault)
- **Border top:** 1dp, `#334155` (border color)
- **Elevation:** 8dp (Android only)
- **Active color:** `#6366F1` (primary)
- **Inactive color:** `#94A3B8` (tabIconDefault)
- **Label style:** 12sp, semibold, always visible
- **Icon style:** 24dp, with 4dp margin adjustments for Android
- **Item padding:** 4dp vertical (Android)

---

## Design System

### Colors (Dark Theme)

**Core Palette:**
```
Primary:         #6366F1 (Indigo) - CTAs, active states, branding
Secondary:       #8B5CF6 (Purple) - Secondary actions
Accent:          #EC4899 (Pink) - Highlights, chat button, notifications
```

**Backgrounds:**
```
backgroundRoot:      #0F172A - App root background
backgroundDefault:   #1E293B - Cards (elevation 1), tab bar
backgroundSecondary: #334155 - Cards (elevation 2)
backgroundTertiary:  #475569 - Cards (elevation 3)
```

**Text:**
```
text:           #F1F5F9 - Primary text
textSecondary:  #94A3B8 - Secondary/muted text
buttonText:     #FFFFFF - Button labels
```

**Status:**
```
success: #10B981 (Green)
warning: #F59E0B (Amber)
error:   #EF4444 (Red)
```

**Other:**
```
border:         #334155
link:           #6366F1
tabIconDefault: #94A3B8
```

### Gradients
```
Primary:    #6366F1 → #8B5CF6 (indigo to purple)
Accent:     #8B5CF6 → #EC4899 (purple to pink)
Background: #0F172A → #1E293B (root to default)
```

### Typography

**Font Families:**
- **Android:** Roboto (system default)
- **Web:** Inter, system-ui, sans-serif
- **Monospace:** JetBrains Mono (code blocks)

**Type Scale:**
```
h1:      32sp, Bold (700)
h2:      24sp, SemiBold (600)
h3:      20sp, SemiBold (600)
h4:      18sp, SemiBold (600)
body:    16sp, Regular (400)
small:   14sp, Regular (400)
caption: 12sp, Regular (400)
```

### Spacing
```
xs:   4dp
sm:   8dp
md:   12dp
lg:   16dp
xl:   24dp
2xl:  32dp
3xl:  48dp

inputHeight:  48dp
buttonHeight: 48dp
```

### Border Radius
```
xs:   8dp
sm:   12dp
md:   16dp
lg:   20dp
xl:   24dp
2xl:  32dp  (cards default)
full: 9999dp (circular buttons)
```

---

## Components

### Cards
Uses elevation-based background colors (no shadows):
- **Elevation 0:** `backgroundRoot` (#0F172A)
- **Elevation 1:** `backgroundDefault` (#1E293B) - default
- **Elevation 2:** `backgroundSecondary` (#334155)
- **Elevation 3:** `backgroundTertiary` (#475569)

**Specifications:**
- Padding: `xl` (24dp)
- Border radius: `2xl` (32dp)
- Press animation: Scale to 0.98 with spring config
- Spring config: damping 15, mass 0.3, stiffness 150

### Buttons

**Header Buttons (ZekeHeaderButtons):**
- Size: 40x40dp circular
- Background: Semi-transparent (`rgba(30, 41, 59, 0.6)`)
- Chat button: Purple tint (`rgba(139, 92, 246, 0.15)`)
- Icon size: 22dp
- Press state: opacity 0.7, scale 0.95
- Hit slop: 8dp all sides

**Primary Buttons:**
- Height: 48dp
- Border radius: 24dp (pill shape)
- Background: Gradient (primary)
- Text: White, 16sp

### Icons
- Library: Feather icons from @expo/vector-icons
- Default size: 22-24dp
- Active: Filled or primary color
- Inactive: Outlined or muted color (`#94A3B8`)

### App Bar / Header
- Background: Platform-dependent
  - **Android:** Solid `backgroundDefault` (#1E293B) with 2dp elevation
  - **iOS:** Blur effect with semi-transparent overlay
- Title style: 18sp, semibold
- Tint color: `text` (#F1F5F9)

---

## Screen Layouts

### Safe Area Handling
- **Top padding (transparent header):** headerHeight + 24dp
- **Top padding (opaque header):** 24dp
- **Top padding (no header):** insets.top + 24dp
- **Bottom padding (with tab bar):** tabBarHeight + 24dp
- **Bottom padding (no tab bar):** insets.bottom + 24dp

### Scrollable Content
- Apply padding to `contentContainerStyle`
- Add `scrollIndicatorInsets` with bottom set to insets.bottom
- Use `KeyboardAwareScrollView` for screens with text inputs

---

## Animations & Interactions

### Press States
- Scale: 0.98 on press
- Spring animation config:
  - damping: 15
  - mass: 0.3
  - stiffness: 150
  - overshootClamping: true

### Status Indicator Pulse
- Duration: 800ms per phase
- Scale animation: 1 → 1.4 → 1
- Opacity animation: 1 → 0 → 1
- Easing: ease-out (expand), ease-in (contract)
- Repeat: Infinite loop

### Transitions
- Screen transitions: 300ms ease-in-out
- Modal: Slide up 250ms
- Android: slide_from_right animation

---

## Accessibility

- Minimum touch target: **48dp x 48dp**
- Text contrast: WCAG AA compliant (light text on dark backgrounds)
- TalkBack: Descriptive labels for all interactive elements
- Font scaling: Support Android accessibility settings
- Hit slop: 8-10dp on smaller interactive elements

---

## Platform Notes (Android/Pixel 8)

- **Dark mode only:** Both light and dark theme tokens point to dark colors
- **Gesture navigation:** Content extends behind system bars with proper insets
- **Status bar:** Light content icons on dark background
- **Navigation bar:** Consistent with app background
- **Edge-to-edge:** Full bleed content with safe area padding
- **Tab bar:** Solid background on Android (blur on iOS)

---

## Key Files Reference

- **Theme tokens:** `client/constants/theme.ts`
- **Header components:** `client/components/ZekeHeader.tsx`, `client/components/ZekeSubHeader.tsx`, `client/components/HeaderTitle.tsx`
- **Card component:** `client/components/Card.tsx`
- **Screen options hook:** `client/hooks/useScreenOptions.tsx`
- **Theme hook:** `client/hooks/useTheme.tsx`
- **Tab navigator:** `client/navigation/MainTabNavigator.tsx`
