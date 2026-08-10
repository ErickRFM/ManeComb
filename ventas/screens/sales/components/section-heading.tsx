import { Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { webStyle } from '../utils';
import type { IconName } from '../types';

export function SectionHeading({
  centered,
  eyebrow,
  intro,
  nativeID,
  title,
}: {
  centered?: boolean;
  eyebrow: string;
  intro?: string;
  nativeID?: string;
  title: string;
}) {
  return (
    <View
      nativeID={nativeID}
      style={[
        styles.sectionHeading,
        centered ? styles.sectionHeadingCentered : undefined,
        webStyle({ scrollMarginTop: 120 }),
      ]}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[styles.sectionTitle, centered ? styles.sectionTitleCentered : undefined]}>
        {title}
      </Text>
      {intro ? (
        <Text style={[styles.sectionIntro, centered ? styles.sectionIntroCentered : undefined]}>{intro}</Text>
      ) : null}
    </View>
  );
}

export function ActionButton({
  compact,
  icon,
  label,
  onPress,
  variant = 'solid',
}: {
  compact?: boolean;
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost';
}) {
  const solid = variant === 'solid';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.actionButton,
          compact ? styles.actionButtonCompact : undefined,
          solid ? styles.actionButtonSolid : styles.actionButtonGhost,
          hovered ? styles.hoverLift : undefined,
          webStyle({
            cursor: 'pointer',
            transitionDuration: '240ms',
            transitionProperty: 'transform, box-shadow, background-color, border-color',
            boxShadow: solid && hovered ? `0 0 24px ${neonPalette.accentGlow}` : undefined,
          }),
          pressed ? styles.buttonPressed : undefined,
        ];
      }}>
      <Text style={[styles.actionButtonText, solid ? styles.actionButtonTextSolid : undefined]} numberOfLines={1}>
        {label}
      </Text>
      <MaterialCommunityIcons
        name={icon}
        size={compact ? 15 : 18}
        color={solid ? '#FFFFFF' : neonPalette.text}
      />
    </Pressable>
  );
}

export function BenefitCard({
  benefit,
  index,
  isPhone,
}: {
  benefit: { title: string; body: string; icon: IconName; color: string };
  index: number;
  isPhone: boolean;
}) {
  return (
    <View
      style={[
        styles.benefitCard,
        isPhone ? styles.benefitCardPhone : undefined,
        { borderColor: `${benefit.color}42` },
        webStyle({
          backgroundImage: 'linear-gradient(145deg, rgba(10, 17, 39, 0.74), rgba(8, 13, 30, 0.82))',
          boxShadow: `0 0 0 1px ${benefit.color}16, 0 14px 36px rgba(0, 0, 0, 0.16)`,
          transitionDelay: `${index * 24}ms`,
          backdropFilter: 'blur(14px)',
        }),
      ]}>
      <View
        style={[
          styles.benefitIcon,
          { backgroundColor: `${benefit.color}14`, borderColor: `${benefit.color}44` },
          webStyle({ boxShadow: `0 0 22px ${benefit.color}26` }),
        ]}>
        <MaterialCommunityIcons name={benefit.icon} size={27} color={benefit.color} />
      </View>
      <Text style={styles.benefitTitle}>{benefit.title}</Text>
      <Text style={styles.benefitBody}>{benefit.body}</Text>
    </View>
  );
}

export function ProcessStep({
  index,
  isLast,
  isPhone,
  step,
}: {
  index: number;
  isLast: boolean;
  isPhone: boolean;
  step: { title: string; body: string; icon: IconName };
}) {
  const color = [neonPalette.cyan, neonPalette.accent, neonPalette.violet, neonPalette.mint][index];

  return (
    <View style={[styles.processStep, isPhone ? styles.processStepPhone : undefined]}>
      <View style={styles.processNodeWrap}>
        <View
          style={[
            styles.processNode,
            { borderColor: `${color}88`, backgroundColor: `${color}12` },
            webStyle({ boxShadow: `0 0 32px ${color}22` }),
          ]}>
          <Text style={[styles.processNumber, { color }]}>{index + 1}</Text>
          <MaterialCommunityIcons name={step.icon} size={30} color={color} />
        </View>
        {!isLast ? (
          <View
            style={[
              styles.processConnector,
              isPhone ? styles.processConnectorPhone : undefined,
              webStyle({
                backgroundImage: `linear-gradient(90deg, ${color}00, ${color}, ${neonPalette.accent})`,
                boxShadow: `0 0 18px ${color}66`,
              }),
            ]}
          />
        ) : null}
      </View>
      <Text style={styles.processTitle}>{step.title}</Text>
      <Text style={styles.processBody}>{step.body}</Text>
    </View>
  );
}

export function RoundIconButton({
  accessibilityLabel,
  icon,
  onPress,
  disabled,
}: {
  accessibilityLabel: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        const pressed = state.pressed;

        return [
          styles.roundButton,
          hovered && !disabled ? styles.hoverLift : undefined,
          disabled ? styles.roundButtonDisabled : undefined,
          webStyle({
            cursor: disabled ? 'default' : 'pointer',
            transitionDuration: '220ms',
            transitionProperty: 'transform, box-shadow, border-color, background-color',
            boxShadow: hovered && !disabled ? `0 0 18px ${neonPalette.cyan}33` : undefined,
          }),
          pressed && !disabled ? styles.buttonPressed : undefined,
        ];
      }}>
      <MaterialCommunityIcons
        name={icon}
        size={24}
        color={disabled ? 'rgba(138, 147, 178, 0.55)' : neonPalette.text}
      />
    </Pressable>
  );
}