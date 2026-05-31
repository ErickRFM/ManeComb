import { Platform } from 'react-native';

export function MapScreen() {
  const Screen =
    Platform.OS === 'web'
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ? require('./map-screen.web').MapScreen
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      : require('./map-screen.native').MapScreen;

  return <Screen />;
}
