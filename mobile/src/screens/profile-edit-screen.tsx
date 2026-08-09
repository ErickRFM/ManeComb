import { useAppStore } from '@/src/store/use-app-store';
import { ProfileEditScreen as CompanyProfileEditScreen } from './company-profile-edit-screen';
import { DriverProfileEditScreen } from './driver-profile-edit-screen';

export function ProfileEditScreen() {
  const user = useAppStore((state) => state.user);
  const isDriverProfile = user?.role === 'driver' || user?.role === 'conductor';

  return isDriverProfile ? <DriverProfileEditScreen /> : <CompanyProfileEditScreen />;
}
