import { Image } from '@/src/native/image';
import { StyleSheet, Text, View } from 'react-native';
import { Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { User } from '@/src/types/app';
import { PresenceDot } from '@/src/components/presence-indicator';
import type { PresenceStatus } from '@/src/utils/presence';

type UserAvatarProps = {
  user?: Pick<User, 'avatar' | 'avatarUrl' | 'name'> | null;
  size?: number;
  showStatus?: boolean;
  status?: PresenceStatus;
};

export function UserAvatar({ user, size = 52, showStatus = false, status }: UserAvatarProps) {
  const { theme } = useAppTheme();

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.accentSoft,
            borderColor: theme.colors.line,
          },
        ]}>
        {user?.avatarUrl ? (
          <Image source={user.avatarUrl} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
        ) : (
          <Text
            style={[
              styles.initials,
              {
                color: theme.colors.accent,
                fontSize: Math.max(14, size * 0.33),
              },
            ]}>
            {user?.avatar || 'MC'}
          </Text>
        )}
      </View>
      {showStatus ? (
        <View style={styles.statusDot}><PresenceDot status={status || 'unknown'} size={12} /></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  initials: {
    fontFamily: Typography.display,
    fontWeight: '800',
  },
  statusDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
  },
});
