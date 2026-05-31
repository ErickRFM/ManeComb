import useAuthStore from "../store/authStore";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";

export default function AppNavigator() {
  const user = useAuthStore((state) => state.user);

  return user ? <MainNavigator /> : <AuthNavigator />;
}