import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, TextInput, View } from 'react-native';
import { getTextInputProps } from '@/src/utils/text-input-props';

export function AlertSearch({ onChange, onClear, search, styles, theme }: { onChange: (value: string) => void; onClear: () => void; search: string; styles: any; theme: any }) {
  return (
    <View style={styles.searchShell}>
      <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.muted} />
      <TextInput
        {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'search' })}
        placeholder="Buscar alerta..."
        placeholderTextColor={theme.colors.muted}
        style={styles.searchInput}
        value={search}
        onChangeText={onChange}
      />
      {search ? (
        <Pressable accessibilityLabel="Limpiar busqueda" accessibilityRole="button" onPress={onClear} style={styles.clearSearchButton}>
          <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
