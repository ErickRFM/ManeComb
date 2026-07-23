import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { DriverActivationUnit } from '@/src/types/app';
import { styles } from '../customer-auth-screen.styles';

export function UnitSelector({
  isLoading,
  onSelect,
  selectedUnitId,
  units,
}: {
  isLoading: boolean;
  onSelect: (unitId: string) => void;
  selectedUnitId: string;
  units: DriverActivationUnit[] | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Unidad asignada</Text>
        <View style={styles.unitPlaceholder}>
          <ActivityIndicator color="#E31E24" />
        </View>
      </View>
    );
  }

  if (!units) {
    return null;
  }

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Unidad asignada</Text>
      {units.length === 0 ? (
        <View style={styles.unitPlaceholder}>
          <Text style={styles.unitEmptyText}>
            No hay unidades disponibles para esta empresa.
          </Text>
        </View>
      ) : (
        <View style={styles.unitCombo}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            onPress={() => setIsOpen((current) => !current)}
            style={({ pressed }) => [styles.unitComboTrigger, pressed ? styles.pressed : undefined]}>
            <Text style={selectedUnitId ? styles.unitComboValue : styles.unitComboPlaceholder}>
              {selectedUnitId
                ? formatActivationUnit(units.find((unit) => unit.id === selectedUnitId))
                : 'Selecciona una unidad'}
            </Text>
            <MaterialCommunityIcons
              name={isOpen ? 'chevron-up' : 'chevron-down'}
              color="#333333"
              size={22}
            />
          </Pressable>
          {isOpen ? (
            <View style={styles.unitComboMenu}>
              {units.map((unit) => (
                <Pressable
                  key={unit.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: unit.id === selectedUnitId }}
                  onPress={() => {
                    onSelect(unit.id);
                    setIsOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.unitComboOption,
                    unit.id === selectedUnitId ? styles.unitComboOptionActive : undefined,
                    pressed ? styles.pressed : undefined,
                  ]}>
                  <Text style={styles.unitCode}>{unit.code}</Text>
                  {unit.plate ? <Text style={styles.unitDetails}>{unit.plate}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function formatActivationUnit(unit: DriverActivationUnit | undefined) {
  if (!unit) {
    return 'Selecciona una unidad';
  }

  return unit.plate ? `${unit.code} · ${unit.plate}` : unit.code;
}
