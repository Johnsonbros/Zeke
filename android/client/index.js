import { registerRootComponent } from "expo";
import { Platform } from "react-native";

import App from "@/App";

registerRootComponent(App);

// Only register widget task handler on Android native builds
if (Platform.OS === "android") {
  try {
    const { registerWidgetTaskHandler } = require("react-native-android-widget");
    const { widgetTaskHandler } = require("./widgets/widget-task-handler");
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (error) {
    console.log("Widget handler registration skipped:", error?.message);
  }
}
