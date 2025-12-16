#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=========================================="
echo "  ZEKE Android App Update & Build"
echo "=========================================="
echo ""

BUILD_PROFILE="${1:-preview}"

echo "Build profile: $BUILD_PROFILE"
echo ""

if ! command -v npx &> /dev/null; then
    echo "Error: npm/npx not found. Please install Node.js first."
    exit 1
fi

echo "Step 1: Cleaning old builds..."
rm -rf node_modules/.cache 2>/dev/null || true

echo ""
echo "Step 2: Installing/updating dependencies..."
npm install

echo ""
echo "Step 3: Checking EAS CLI login status..."
if ! npx eas whoami &> /dev/null; then
    echo "You need to log in to Expo EAS first."
    npx eas login
fi

echo ""
echo "Step 4: Starting Android build ($BUILD_PROFILE profile)..."
echo ""

npx eas build -p android --profile "$BUILD_PROFILE"

echo ""
echo "=========================================="
echo "  Build Complete!"
echo "=========================================="
echo ""
echo "Download the APK and install on your Pixel 8."
echo ""
echo "Usage for different build types:"
echo "  ./update-and-build.sh           # Preview build (APK)"
echo "  ./update-and-build.sh preview   # Preview build (APK)"  
echo "  ./update-and-build.sh production # Production build (AAB for Play Store)"
echo ""
