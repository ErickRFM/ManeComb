import { Pressable, Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import type { UserAccountStatus } from '@/src/types/app';
import { styles } from '../users.styles';

export function PortalUserStatusSelector({
  onChange,
  value,
}: {
  onChange: (status: UserAccountStatus) => void;
  value: UserAccountStatus;
}) {
  return (
    <View style={styles.statusSelector}>
      {(['active', 'suspended', 'pending'] as const).map((status) => (
        <Pressable
          key={status}
          accessibilityRole="button"
          onPress={() => onChange(status)}
          style={[
            styles.statusOption,
            { borderColor: value === status ? palette.info : palette.line },
            value === status ? { backgroundColor: palette.infoSoft } : { backgroundColor: palette.surface },
          ]}>
          <Text style={[styles.statusOptionText, { color: value === status ? palette.info : palette.text }]}>
            {status === 'active' ? 'Activo' : status === 'suspended' ? 'Suspendido' : 'Pendiente'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
