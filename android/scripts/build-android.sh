#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=========================================="
echo "  ZEKE Android App Build Script"
echo "=========================================="
echo ""

if ! command -v npx &> /dev/null; then
    echo "Error: npm/npx not found. Please install Node.js first."
    exit 1
fi

echo "Step 1: Installing dependencies..."
npm install

echo ""
echo "Step 2: Checking EAS CLI login status..."
if ! npx eas whoami &> /dev/null; then
    echo "You need to log in to Expo EAS first."
    echo "Running: npx eas login"
    npx eas login
fi

echo ""
echo "Step 3: Starting Android build..."
echo ""
echo "Build profile: preview (generates installable APK)"
echo "This will take 5-10 minutes on EAS servers."
echo ""

npx eas build -p android --profile preview

echo ""
echo "=========================================="
echo "  Build Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Download the APK from the link above"
echo "2. Transfer to your Pixel 8 and install"
echo "3. Grant Bluetooth and Location permissions"
echo "4. Connect your Omi or Limitless device"
echo ""
