import { createNavigationContainerRef } from '@react-navigation/native';

export type RootParamList = {
  Login: undefined;
  Register: undefined;
  Activation: undefined;
  PlanSelection: undefined;
  PendingPayment: undefined;
  DashboardTabs: undefined;
  Dashboard: undefined;
  Fleet: undefined;
  GPS: undefined;
  Incidents: undefined;
  Profile: undefined;
};

export const navigationRef = createNavigationContainerRef<RootParamList>();
