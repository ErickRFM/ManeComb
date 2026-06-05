import { Text, type StyleProp, type TextStyle } from 'react-native';
import glyphMap from 'react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

type IconProps = {
  name: keyof typeof glyphMap;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

function Icon({ name, size = 12, color = 'black', style, ...props }: IconProps) {
  const code = glyphMap[name] || 63;
  const glyph = typeof code === 'number' ? String.fromCodePoint(code) : '?';

  return (
    <Text
      selectable={false}
      {...props}
      style={[
        {
          color,
          fontFamily: 'MaterialCommunityIcons',
          fontSize: size,
          fontStyle: 'normal',
          fontWeight: 'normal',
          lineHeight: size,
        },
        style,
      ]}>
      {glyph}
    </Text>
  );
}

Icon.glyphMap = glyphMap;

export const MaterialCommunityIcons = Icon as typeof Icon & {
  glyphMap: Record<string, number>;
};
