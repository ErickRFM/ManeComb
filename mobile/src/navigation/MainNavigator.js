import useAuthStore from "../store/authStore";
import AdminHome from "../screens/admin/AdminHome";
import DriverHome from "../screens/driver/DriverHome";

export default function MainNavigator() {
  const user = useAuthStore((state) => state.user);

  if (user.role === "admin") return <AdminHome />;
  return <DriverHome />;
}