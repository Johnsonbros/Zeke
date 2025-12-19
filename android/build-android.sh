#!/bin/bash

echo "Building ZEKE Android APK..."
echo ""
echo "This will build a development APK using Expo EAS Build."
echo "The build happens in the cloud - you'll get a download link when complete."
echo ""

npx eas-cli build --profile development --platform android

echo ""
echo "Build submitted! Check the link above to download your APK when ready."
