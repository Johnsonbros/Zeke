import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { ZekeLocationWidget } from './ZekeLocationWidget';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';

const WIDGET_DATA_KEY = 'zeke_widget_data';
const WIDGET_NAME = 'ZekeLocation';

interface WidgetData {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved?: string;
  errorMessage?: string;
}

async function getWidgetData(): Promise<WidgetData> {
  try {
    const data = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Widget] Failed to get widget data:', error);
  }
  return { status: 'idle' };
}

async function setWidgetData(data: WidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[Widget] Failed to set widget data:', error);
  }
}

function getApiBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }
  return 'http://localhost:5000';
}

async function saveLocationToZeke(): Promise<{ success: boolean; locationName?: string; error?: string }> {
  try {
    const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
    
    if (existingStatus !== 'granted') {
      return { 
        success: false, 
        error: 'Open app to grant permission' 
      };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = location.coords;
    
    let locationName = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    
    try {
      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      const address = reverseGeocode[0];
      if (address) {
        locationName = address.street || address.name || address.city || locationName;
      }
    } catch (geocodeError) {
      console.log('[Widget] Geocode failed, using coordinates');
    }

    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/api/widget/save-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude,
        longitude,
        locationName,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error('[Widget] Failed to save location:', response.status);
      return { success: false, error: 'Save failed' };
    }

    return { success: true, locationName: locationName.slice(0, 25) };
  } catch (error) {
    console.error('[Widget] Error saving location:', error);
    return { success: false, error: 'Location unavailable' };
  }
}

async function scheduleResetToIdle() {
  await new Promise(resolve => setTimeout(resolve, 4000));
  await setWidgetData({ status: 'idle' });
  await requestWidgetUpdate({ widgetName: WIDGET_NAME });
}

const nameToWidget: Record<string, React.FC<any>> = {
  ZekeLocation: ZekeLocationWidget,
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;
  const Widget = nameToWidget[widgetInfo.widgetName];

  if (!Widget) {
    console.error('[Widget] Unknown widget:', widgetInfo.widgetName);
    return;
  }

  const widgetData = await getWidgetData();

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<Widget {...widgetData} />);
      break;

    case 'WIDGET_CLICK':
      if (props.clickAction === 'SAVE_LOCATION') {
        const { status: permStatus } = await Location.getForegroundPermissionsAsync();
        
        if (permStatus !== 'granted') {
          await setWidgetData({ 
            status: 'error', 
            errorMessage: 'Tap to open app' 
          });
          props.renderWidget(<Widget status="error" errorMessage="Tap to open app" />);
          
          try {
            await Linking.openURL('zekeai://location');
          } catch (linkError) {
            console.log('[Widget] Could not open app:', linkError);
          }
          return;
        }

        await setWidgetData({ status: 'saving' });
        props.renderWidget(<Widget status="saving" />);

        const result = await saveLocationToZeke();
        
        if (result.success) {
          await setWidgetData({ 
            status: 'saved', 
            lastSaved: result.locationName 
          });
          props.renderWidget(<Widget status="saved" lastSaved={result.locationName} />);
        } else {
          await setWidgetData({ 
            status: 'error', 
            errorMessage: result.error 
          });
          props.renderWidget(<Widget status="error" errorMessage={result.error} />);
        }

        scheduleResetToIdle();
      }
      break;

    default:
      break;
  }
}
