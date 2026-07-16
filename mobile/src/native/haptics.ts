import { AccessibilityInfo, Vibration } from 'react-native';

export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
} as const;

let feedbackEnabled = true;

export function setHapticFeedbackEnabled(enabled: boolean) {
  feedbackEnabled = enabled;
}

export async function canUseHapticFeedback() {
  if (!feedbackEnabled) return false;

  try {
    return !(await AccessibilityInfo.isReduceMotionEnabled());
  } catch {
    return true;
  }
}

export async function impactAsync(style: (typeof ImpactFeedbackStyle)[keyof typeof ImpactFeedbackStyle]) {
  if (!(await canUseHapticFeedback())) return;
  const duration = style === ImpactFeedbackStyle.Heavy ? 35 : style === ImpactFeedbackStyle.Medium ? 25 : 15;
  Vibration.vibrate(duration);
}
