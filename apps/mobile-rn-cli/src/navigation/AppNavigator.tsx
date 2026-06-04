import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSessionStore } from '../store/session-store';
import { colors } from '../theme/colors';
import { canOperate, hasPendingPayment, isSubscriptionBlocked, needsPlan } from '../utils/access';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ActivationScreen } from '../screens/ActivationScreen';
import { PlanSelectionScreen } from '../screens/PlanSelectionScreen';
import { PendingPaymentScreen } from '../screens/PendingPaymentScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FleetScreen } from '../screens/FleetScreen';
import { GpsScreen } from '../screens/GpsScreen';
import { IncidentsScreen } from '../screens/IncidentsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { RootParamList } from './navigation-ref';

const Stack = createNativeStackNavigator<RootParamList>();
const Tabs = createBottomTabNavigator<RootParamList>();

function LoadingGate() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.loadingText}>Preparando ManeComb...</Text>
    </View>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Registro' }} />
      <Stack.Screen name="Activation" component={ActivationScreen} options={{ title: 'Activación' }} />
    </Stack.Navigator>
  );
}

function PlanStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PlanSelection" component={PlanSelectionScreen} options={{ title: 'Planes' }} />
      <Stack.Screen name="PendingPayment" component={PendingPaymentScreen} options={{ title: 'Pago pendiente' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSoft,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
      }}>
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="Fleet" component={FleetScreen} options={{ title: 'Combis' }} />
      <Tabs.Screen name="GPS" component={GpsScreen} options={{ title: 'GPS' }} />
      <Tabs.Screen name="Incidents" component={IncidentsScreen} options={{ title: 'Bitácora' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { accessToken, user, isBootstrapping } = useSessionStore();

  if (isBootstrapping) {
    return <LoadingGate />;
  }

  if (!accessToken || !user) {
    return <AuthStack />;
  }

  if (hasPendingPayment(user) || isSubscriptionBlocked(user)) {
    return <PendingPaymentScreen />;
  }

  if (needsPlan(user) || !canOperate(user)) {
    return <PlanStack />;
  }

  return <MainTabs />;
}

const screenOptions = {
  headerStyle: {
    backgroundColor: colors.background,
  },
  headerTintColor: colors.text,
  headerTitleStyle: {
    fontWeight: '800' as const,
  },
  contentStyle: {
    backgroundColor: colors.background,
  },
};

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
});
