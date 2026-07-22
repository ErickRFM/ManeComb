import { Pressable, Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { incidentStatuses } from '../incidents.constants';
import { styles } from '../incidents.styles';
import { getStatusMeta } from '../incidents.utils';

type PortalIncidentStatusSelectorProps = {
  onChange: (status: string) => void;
  value: string;
};

export function PortalIncidentStatusSelector({ onChange, value }: PortalIncidentStatusSelectorProps) {
  return (
    <View style={styles.statusSelector}>
      {incidentStatuses.map((status) => (
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
            {getStatusMeta(status).label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
