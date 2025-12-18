import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

interface ZekeLocationWidgetProps {
  status?: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved?: string;
  errorMessage?: string;
}

export function ZekeLocationWidget({ status = 'idle', lastSaved, errorMessage }: ZekeLocationWidgetProps) {
  const getStatusText = () => {
    switch (status) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return lastSaved ? `Saved: ${lastSaved}` : 'Location Saved!';
      case 'error':
        return errorMessage || 'Tap to open app';
      default:
        return 'Tap to save location';
    }
  };

  const getButtonColor = () => {
    switch (status) {
      case 'saving':
        return '#64748B';
      case 'saved':
        return '#22C55E';
      case 'error':
        return '#EF4444';
      default:
        return '#6366F1';
    }
  };

  const getIconSymbol = () => {
    switch (status) {
      case 'saving':
        return '...';
      case 'saved':
        return 'OK';
      case 'error':
        return '!';
      default:
        return 'LOC';
    }
  };

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0F172A',
        borderRadius: 24,
        padding: 16,
      }}
      clickAction="SAVE_LOCATION"
      clickActionData={{ action: 'save_location' }}
    >
      <FlexWidget
        style={{
          width: 56,
          height: 56,
          backgroundColor: getButtonColor(),
          borderRadius: 28,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <TextWidget
          text={getIconSymbol()}
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: '#FFFFFF',
          }}
        />
      </FlexWidget>

      <TextWidget
        text="ZEKE"
        style={{
          fontSize: 18,
          fontWeight: '700',
          color: '#F8FAFC',
          marginBottom: 4,
        }}
      />

      <TextWidget
        text={getStatusText()}
        style={{
          fontSize: 12,
          color: '#94A3B8',
          textAlign: 'center',
        }}
      />
    </FlexWidget>
  );
}
