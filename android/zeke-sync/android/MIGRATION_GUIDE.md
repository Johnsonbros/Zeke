# Migration Guide: Adding Expo Mobile App to Zeke Repository

This guide walks you through integrating the Expo mobile app from this Replit project into your Zeke GitHub repository.

## Overview

**What you're doing:**
- Replacing the existing Capacitor-based `android/` folder with a new Expo mobile app
- The mobile app will connect to your existing Zeke backend server
- Both web and mobile clients will share the same backend

**Repository structure after migration:**
```
Zeke/
├── client/           # Keep - existing web client
├── mobile/           # NEW - Expo mobile app (from this project)
├── server/           # Keep - existing backend (more mature)
├── shared/           # Keep - existing schemas (SQLite-based)
├── python_agents/    # Keep
├── scripts/          # NEW - Expo build scripts
├── docs/             # Keep
├── evals/            # Keep
├── notes/            # Keep
├── tests/            # Keep
├── app.json          # NEW - Expo configuration
├── babel.config.js   # NEW - Expo babel config
├── eas.json          # NEW - Expo EAS config
└── [delete android/] # Remove old Capacitor app
```

---

## Step 1: Prepare Your Zeke Repository

1. **Create a new branch:**
   ```bash
   cd Zeke
   git checkout -b feature/expo-mobile-app
   ```

2. **Delete the old Android/Capacitor folder:**
   ```bash
   rm -rf android/
   ```

---

## Step 2: Copy Files from This Project

### Files to Copy to Zeke Root:

| From (This Project)     | To (Zeke Repo)          | Notes |
|------------------------|-------------------------|-------|
| `client/`              | `mobile/`               | Rename folder to `mobile` |
| `scripts/`             | `scripts/expo/`         | Place in subfolder to avoid conflicts |
| `app.json`             | `app.json`              | Expo app configuration |
| `babel.config.js`      | `babel.config.js`       | May need to merge if exists |
| `eas.json`             | `eas.json`              | EAS Build configuration |
| `assets/`              | `assets/`               | App icons, splash screens |
| `design_guidelines.md` | `docs/design_guidelines.md` | Design reference |

### Files to NOT Copy (Zeke already has better versions):

- `server/` - Zeke's server is more complete
- `shared/schema.ts` - Zeke's schema is more comprehensive
- `package.json` - Will need manual merging
- `drizzle.config.ts` - Zeke uses SQLite, not PostgreSQL

---

## Step 3: Update Mobile App API Configuration

The mobile app needs to connect to the Zeke backend instead of its current server.

### 3.1 Configure API Connection (No Code Changes Needed!)

The mobile app already supports connecting to your Zeke backend via environment variables. Simply set:

```bash
# In your Zeke repository, add to your .env file:
EXPO_PUBLIC_ZEKE_BACKEND_URL=https://your-zeke-backend.replit.app

# Or for local development:
EXPO_PUBLIC_DOMAIN=your-local-domain:5000
```

The mobile app's `query-client.ts` automatically checks for `EXPO_PUBLIC_ZEKE_BACKEND_URL` first (for sync mode with external Zeke), then falls back to `EXPO_PUBLIC_DOMAIN` (for local backend).

### 3.2 Adapt API Endpoints

The mobile app currently uses these endpoints that need mapping to Zeke's API:

| Current Mobile Endpoint | Zeke Equivalent | Action Needed |
|------------------------|-----------------|---------------|
| `/api/devices` | - | Add to Zeke or remove feature |
| `/api/memories` | Similar via `/api/omi/*` | Adapt to use Omi endpoints |
| `/api/chat/sessions` | `/api/conversations` | Rename to match Zeke |
| `/api/chat/sessions/:id/messages` | `/api/conversations/:id/messages` | Rename to match |
| `/api/transcribe` | `/api/transcribe` | Add to Zeke if missing |
| `/api/locations` | `/api/locations` | Already exists in Zeke |
| `/api/calendar/*` | `/api/calendar/*` | Already exists in Zeke |

---

## Step 4: Database Considerations

### Important: Database Type Difference

- **This Project:** PostgreSQL (`drizzle-orm/pg-core`)
- **Zeke:** SQLite (`drizzle-orm/sqlite-core`)

**Recommended approach:** Keep Zeke's SQLite database and adapt the mobile app to work with it.

### Schema Mapping

| Mobile App Tables | Zeke Equivalent | Notes |
|------------------|-----------------|-------|
| `users` | - | Not needed if using contacts |
| `devices` | - | May need to add to Zeke |
| `memories` | `memoryNotes` | Similar concept, different structure |
| `chatSessions` | `conversations` | Similar, use Zeke's version |
| `chatMessages` | `messages` | Similar, use Zeke's version |
| `locations` | Zeke has location tables | Use Zeke's implementation |
| `starredPlaces` | `savedPlaces` | Use Zeke's version |

---

## Step 5: Update Package.json

You'll need to merge the Expo dependencies into Zeke's package.json. 

**Option A: Copy from source package.json**
The most reliable approach is to copy the dependencies directly from the Expo project's `package.json` file, as versions must be compatible with each other.

**Option B: Key dependencies (from current package.json)**
These are the actual versions used in the Expo project:

```json
{
  "dependencies": {
    "expo": "^54.0.23",
    "expo-audio": "^1.1.0",
    "expo-blur": "^15.0.7",
    "expo-constants": "~18.0.9",
    "expo-document-picker": "^14.0.8",
    "expo-file-system": "^19.0.21",
    "expo-font": "~14.0.9",
    "expo-glass-effect": "~0.1.6",
    "expo-haptics": "~15.0.7",
    "expo-image": "~3.0.10",
    "expo-linear-gradient": "^15.0.8",
    "expo-linking": "~8.0.8",
    "expo-location": "^19.0.8",
    "expo-notifications": "^0.32.15",
    "expo-print": "^15.0.8",
    "expo-sharing": "^14.0.8",
    "expo-splash-screen": "~31.0.10",
    "expo-status-bar": "~3.0.8",
    "expo-system-ui": "~6.0.8",
    "expo-web-browser": "~15.0.9",
    "@react-navigation/native": "^7.1.8",
    "@react-navigation/native-stack": "^7.3.16",
    "@react-navigation/bottom-tabs": "^7.4.0",
    "@react-navigation/elements": "^2.6.3",
    "@tanstack/react-query": "^5.90.7",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-keyboard-controller": "1.18.5"
  }
}
```

**Note:** Always refer to the Expo project's `package.json` for the complete and up-to-date dependency list.

---

## Step 6: Add Expo Scripts

Add these scripts to Zeke's package.json:

```json
{
  "scripts": {
    "expo:start": "expo start",
    "expo:web": "expo start --web",
    "expo:android": "expo start --android",
    "expo:ios": "expo start --ios",
    "expo:build": "node scripts/expo/build.js"
  }
}
```

---

## Step 7: Mobile App Screens to Update

These screens need their API calls updated to match Zeke's backend:

### High Priority (Core Features):
1. **HomeScreen.tsx** - Update to use Zeke's conversation API
2. **ChatScreen.tsx** - Update to use `/api/conversations` endpoints
3. **CalendarScreen.tsx** - Already compatible with Zeke
4. **TasksScreen.tsx** - Update to use Zeke's tasks API
5. **GroceryScreen.tsx** - Update to use Zeke's grocery API
6. **ContactsScreen.tsx** - Update to use Zeke's contacts API

### Lower Priority (May need new backend support):
1. **BluetoothConnectionScreen.tsx** - Device management
2. **LiveCaptureScreen.tsx** - Voice capture
3. **AudioUploadScreen.tsx** - Audio transcription

---

## Step 8: Test the Integration

1. **Start Zeke server locally:**
   ```bash
   npm run dev
   ```

2. **Start Expo app:**
   ```bash
   cd mobile
   npx expo start
   ```

3. **Test on device:**
   - Scan QR code with Expo Go app
   - Verify all screens load
   - Test API endpoints work

---

## Mobile App Files Reference

### Components (mobile/components/)
- AudioPlayer.tsx - Audio playback UI
- Button.tsx - Custom button component
- Card.tsx - Card container with elevation
- ChatBubble.tsx - Chat message bubbles
- DeviceCard.tsx - Device display card
- EmptyState.tsx - Empty content placeholder
- ErrorBoundary.tsx - Error handling wrapper
- FloatingActionButton.tsx - FAB component
- HeaderTitle.tsx - Custom header with app branding
- KeyboardAwareScrollViewCompat.tsx - Keyboard-aware scroll
- SearchBar.tsx - Search input component
- SettingsRow.tsx - Settings list item
- SyncStatus.tsx - Sync indicator
- ThemedText.tsx - Themed text component
- ThemedView.tsx - Themed view container
- VoiceInputButton.tsx - Voice recording button
- ZekeHeader.tsx - ZEKE branding header

### Screens (mobile/screens/)
- AnalyticsScreen.tsx
- AudioUploadScreen.tsx
- BluetoothConnectionScreen.tsx
- CalendarScreen.tsx
- ChatScreen.tsx
- CommunicationLogScreen.tsx
- CommunicationsHubScreen.tsx
- ContactDetailScreen.tsx
- ContactsScreen.tsx
- DataExportScreen.tsx
- GroceryScreen.tsx
- HomeScreen.tsx
- LiveCaptureScreen.tsx
- LocationScreen.tsx
- NotificationSettingsScreen.tsx
- SearchScreen.tsx
- SettingsScreen.tsx
- SmsComposeScreen.tsx
- SmsConversationScreen.tsx
- TasksScreen.tsx

### Navigation (mobile/navigation/)
- CalendarStackNavigator.tsx
- CommunicationStackNavigator.tsx
- ContactsStackNavigator.tsx
- GroceryStackNavigator.tsx
- HomeStackNavigator.tsx
- MainTabNavigator.tsx
- RootStackNavigator.tsx
- SearchStackNavigator.tsx
- SettingsStackNavigator.tsx
- TasksStackNavigator.tsx

### Libraries (mobile/lib/)
- audioStreamer.ts - Audio streaming utilities
- bluetooth.ts - Bluetooth device handling
- deepgram.ts - Deepgram API client
- location.ts - Location services
- mockData.ts - Development mock data
- query-client.ts - React Query configuration
- storage.ts - AsyncStorage wrapper
- zeke-api-adapter.ts - API adapter layer

### Hooks (mobile/hooks/)
- useColorScheme.ts - Color scheme detection
- useLocation.ts - Location hook
- useScreenOptions.ts - Navigation options
- useTheme.ts - Theme hook
- useZekeSync.ts - Zeke sync status

---

## Zeke API Endpoints Available for Mobile

Your Zeke server already has these endpoints the mobile app can use:

### Conversations & Chat
- `GET /api/conversations` - List all conversations
- `POST /api/conversations` - Create conversation
- `GET /api/conversations/:id` - Get conversation
- `DELETE /api/conversations/:id` - Delete conversation
- `GET /api/conversations/:id/messages` - Get messages
- `POST /api/conversations/:id/messages` - Send message

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/toggle` - Toggle completion

### Grocery
- `GET /api/grocery` - List items
- `POST /api/grocery` - Add item
- `PATCH /api/grocery/:id` - Update item
- `DELETE /api/grocery/:id` - Delete item
- `POST /api/grocery/:id/toggle` - Toggle purchased

### Calendar
- `GET /api/calendar/events` - List events
- `POST /api/calendar/events` - Create event
- `PATCH /api/calendar/events/:id` - Update event
- `DELETE /api/calendar/events/:id` - Delete event

### Contacts
- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Create contact
- `GET /api/contacts/:id` - Get contact
- `PATCH /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact

### Location
- `POST /api/location` - Record location
- `GET /api/location/history` - Get history
- `GET /api/location/places` - Get saved places

### Omi Integration
- `POST /api/omi/memory-trigger` - Webhook for new memories
- `GET /api/omi/lifelogs` - Get lifelogs
- `GET /api/omi/memories` - Get Omi memories

---

## Quick Copy Commands

Run these from Zeke repository root after downloading/cloning this project:

```bash
# Set path to this Replit project
EXPO_PROJECT="/path/to/downloaded/expo-project"

# Copy mobile app
cp -r $EXPO_PROJECT/client mobile/

# Copy Expo config files
cp $EXPO_PROJECT/app.json .
cp $EXPO_PROJECT/babel.config.js .
cp $EXPO_PROJECT/eas.json .

# Copy assets
cp -r $EXPO_PROJECT/assets .

# Copy Expo build scripts
mkdir -p scripts/expo
cp $EXPO_PROJECT/scripts/build.js scripts/expo/

# Copy design guidelines
cp $EXPO_PROJECT/design_guidelines.md docs/
```

---

## Questions?

If you run into issues:
1. Check that the Zeke server is running
2. Verify API endpoint paths match
3. Check network requests in React Native debugger
4. Ensure environment variables are set correctly

Happy coding!
