import { Text, View } from 'react-native';
import { authStyles as s } from '../auth.styles';

type Props = {
  message: string | null;
  tone?: 'error' | 'info' | 'success';
};

export function AuthFeedback({ message, tone = 'error' }: Props) {
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={[s.messageBox, tone === 'info' ? s.messageBoxInfo : undefined, tone === 'success' ? s.messageBoxSuccess : undefined]}>
      <Text style={[s.messageText, tone === 'info' ? s.messageTextInfo : undefined, tone === 'success' ? s.messageTextSuccess : undefined]}>{message}</Text>
    </View>
  );
}
