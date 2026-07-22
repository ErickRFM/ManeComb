import { Text, View } from 'react-native';
import { authStyles as s } from '../auth.styles';

type Props = {
  message: string | null;
};

export function AuthFeedback({ message }: Props) {
  if (!message) return null;

  return (
    <View style={s.messageBox}>
      <Text style={s.messageText}>{message}</Text>
    </View>
  );
}
