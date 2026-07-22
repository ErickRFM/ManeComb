import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { formatPortalStatus, getPortalStatusTone } from '../../cards';
import { portalPalette } from '../../portal-theme';
import { styles } from '../onboarding.styles';
import { getStepIcon } from '../onboarding.utils';
import type { PortalOnboardingStep } from '@/src/types/app';

export function ActivationWizardStep({
  index,
  step,
}: {
  index: number;
  step: PortalOnboardingStep;
}) {
  const done = step.status === 'completed';

  return (
    <View style={[styles.stepCard, done ? styles.stepCardDone : undefined]}>
      <View style={styles.stepTop}>
        <View style={styles.stepIndicators}>
          <View style={[styles.stepNumber, done ? styles.stepNumberDone : undefined]}>
            {done ? (
              <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
            ) : (
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            )}
          </View>
          <View style={styles.stepIcon}>
            <MaterialCommunityIcons name={getStepIcon(step.id)} size={19} color={done ? portalPalette.success : portalPalette.accent} />
          </View>
        </View>
        <StatusBadge label={formatPortalStatus(step.status)} tone={getPortalStatusTone(step.status)} />
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        {step.description ? <Text style={styles.stepDescription}>{step.description}</Text> : null}
      </View>
    </View>
  );
}
