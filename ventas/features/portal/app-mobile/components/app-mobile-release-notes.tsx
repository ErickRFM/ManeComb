import React from 'react';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export const AppMobileReleaseNotes = React.forwardRef<any, { version: string; notes: string[] }>(
  function AppMobileReleaseNotes({ version, notes }, ref) {
    if (notes.length === 0) return null;

    return (
      <View ref={ref} style={styles.novidadesCard}>
        <Text style={styles.novidadesTitle}>¿Qué incluye esta versión?</Text>
        <Text style={styles.novidadesSubtitle}>Novedades y mejoras de ManeComb v{version}</Text>
        <View style={styles.novidadesList}>
          {notes.map((note, index) => (
            <View key={index} style={styles.novidadeItem}>
              <View style={styles.novidadeCheckIcon}>
                <MaterialCommunityIcons name="check" size={16} color={portalPalette.success} />
              </View>
              <Text style={styles.novidadeText}>{note}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
);
