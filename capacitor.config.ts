import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thejohnsonbros.zeke',
  appName: 'ZEKE',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https'
  }
};

export default config;
