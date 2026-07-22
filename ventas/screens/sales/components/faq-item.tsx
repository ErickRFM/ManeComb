import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { webStyle } from '../utils';

export function FaqItem({
  answer,
  onPress,
  open,
  question,
}: {
  answer: string;
  onPress: () => void;
  open: boolean;
  question: string;
}) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, progress]);

  const answerStyle = {
    maxHeight: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 130],
    }),
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-4, 0],
        }),
      },
    ],
  };

  const iconStyle = {
    transform: [
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.faqItem,
          open ? styles.faqItemOpen : undefined,
          hovered ? styles.faqItemHover : undefined,
          webStyle({
            cursor: 'pointer',
            transitionDuration: '260ms',
            transitionProperty: 'transform, box-shadow, border-color, background-color, background-image',
            backdropFilter: 'blur(14px)',
            backgroundImage: open
              ? 'linear-gradient(120deg, rgba(0, 194, 255, 0.1), rgba(122, 60, 255, 0.07), rgba(255, 45, 122, 0.05))'
              : hovered
                ? 'linear-gradient(120deg, rgba(245, 247, 255, 0.07), rgba(0, 194, 255, 0.045))'
                : undefined,
            boxShadow: open
              ? `0 0 0 1px ${neonPalette.cyan}22, 0 0 22px rgba(0, 194, 255, 0.16), 0 16px 42px rgba(0, 0, 0, 0.2)`
              : hovered
                ? `0 0 18px rgba(0, 194, 255, 0.14), 0 12px 34px rgba(0, 0, 0, 0.18)`
                : undefined,
          }),
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      <View style={styles.faqQuestionRow}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={iconStyle}>
          <MaterialCommunityIcons
            name={open ? 'minus' : 'plus'}
            size={18}
            color={open ? neonPalette.cyan : neonPalette.muted}
          />
        </Animated.View>
      </View>
      <Animated.View style={[styles.faqAnswerWrap, answerStyle]}>
        <Text style={styles.faqAnswer}>{answer}</Text>
      </Animated.View>
    </Pressable>
  );
}
