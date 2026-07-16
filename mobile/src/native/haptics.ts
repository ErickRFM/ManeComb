import { Vibration } from 'react-native';

export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
} as const;

export async function impactAsync(style: (typeof ImpactFeedbackStyle)[keyof typeof ImpactFeedbackStyle]) {
  const duration = style === ImpactFeedbackStyle.Heavy ? 35 : style === ImpactFeedbackStyle.Medium ? 25 : 15;
  Vibration.vibrate(duration);
}
