#!/bin/bash
# ZEKE Mobile App Migration Script
# Run this script from your Zeke repository root directory

# Configuration - update this path to where you downloaded the Expo project
EXPO_PROJECT_PATH="${1:-./expo-project}"

echo "==================================="
echo "ZEKE Mobile App Migration Script"
echo "==================================="
echo ""

if [ ! -d "$EXPO_PROJECT_PATH" ]; then
    echo "ERROR: Expo project not found at: $EXPO_PROJECT_PATH"
    echo ""
    echo "Usage: ./QUICK_START_MIGRATION.sh /path/to/expo-project"
    echo ""
    echo "First, download or clone the Expo project, then run this script"
    echo "with the path to that project as an argument."
    exit 1
fi

echo "Source: $EXPO_PROJECT_PATH"
echo "Target: $(pwd)"
echo ""

# Confirm before proceeding
read -p "This will modify your Zeke repository. Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Step 1: Creating backup of existing android folder..."
if [ -d "android" ]; then
    mv android android.backup.$(date +%Y%m%d_%H%M%S)
    echo "  - android/ backed up"
else
    echo "  - No android/ folder found (skipping backup)"
fi

echo ""
echo "Step 2: Copying mobile app (client/ -> mobile/)..."
if [ -d "$EXPO_PROJECT_PATH/client" ]; then
    cp -r "$EXPO_PROJECT_PATH/client" mobile
    echo "  - mobile/ folder created"
else
    echo "  ERROR: client/ folder not found in Expo project"
    exit 1
fi

echo ""
echo "Step 3: Copying Expo configuration files..."
for file in app.json babel.config.js eas.json tsconfig.json; do
    if [ -f "$EXPO_PROJECT_PATH/$file" ]; then
        cp "$EXPO_PROJECT_PATH/$file" "./${file}.expo"
        echo "  - Copied $file -> ${file}.expo (manual merge required)"
    fi
done

echo ""
echo "Step 4: Copying assets..."
if [ -d "$EXPO_PROJECT_PATH/assets" ]; then
    mkdir -p assets/mobile
    cp -r "$EXPO_PROJECT_PATH/assets"/* assets/mobile/
    echo "  - assets/mobile/ folder created"
fi

echo ""
echo "Step 5: Copying Expo build scripts..."
mkdir -p scripts/expo
if [ -d "$EXPO_PROJECT_PATH/scripts" ]; then
    cp -r "$EXPO_PROJECT_PATH/scripts"/* scripts/expo/
    echo "  - scripts/expo/ folder created"
fi

echo ""
echo "Step 6: Copying design guidelines..."
if [ -f "$EXPO_PROJECT_PATH/design_guidelines.md" ]; then
    cp "$EXPO_PROJECT_PATH/design_guidelines.md" docs/expo_design_guidelines.md
    echo "  - docs/expo_design_guidelines.md created"
fi

echo ""
echo "==================================="
echo "Migration Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Review and merge configuration files:"
echo "   - app.json.expo -> app.json (if Expo config needed)"
echo "   - babel.config.js.expo -> babel.config.js"
echo "   - tsconfig.json.expo -> tsconfig.json"
echo ""
echo "2. Set your Zeke backend URL (no code changes needed!):"
echo "   Add to .env: EXPO_PUBLIC_ZEKE_BACKEND_URL=https://your-zeke.replit.app"
echo ""
echo "3. Merge Expo dependencies into your package.json:"
echo "   - Copy dependencies from: $EXPO_PROJECT_PATH/package.json"
echo "   - Key packages: expo, react-native, @react-navigation/*, expo-*"
echo "   - Ensure version compatibility - use exact versions from source"
echo ""
echo "4. Install dependencies:"
echo "   npm install"
echo ""
echo "5. Run the app:"
echo "   cd mobile && npx expo start"
echo ""
echo "See MIGRATION_GUIDE.md for detailed instructions."
