import { Platform } from 'react-native';

export function MapScreen() {
  const Screen =
    Platform.OS === 'web'
      ? require('./map-screen.web').MapScreen
      : require('./map-screen.native').MapScreen;

  return <Screen />;
}
