import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { SalesScreen } from 'ventas/screens/sales-screen';

export default function VentasRoute() {
  if (Platform.OS !== 'web') {
    return <Redirect href="/login" />;
  }

  return <SalesScreen />;
}
