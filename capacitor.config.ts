import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'expense-tracker',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
