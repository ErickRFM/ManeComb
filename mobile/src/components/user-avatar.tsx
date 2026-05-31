import { Image } from 'expo-image';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { User } from '@/src/types/app';

type UserAvatarProps = {
  user?: Pick<User, 'avatar' | 'avatarUrl' | 'name'> | null;
  size?: number;
  showStatus?: boolean;
  status?: string;
};

export function UserAvatar({ user, size = 52, showStatus = false, status }: UserAvatarProps) {
  const { theme } = useAppTheme();
  const normalizedStatus = status || 'offline';
  const isOnline = normalizedStatus !== 'offline';

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
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: isOnline ? theme.colors.success : theme.colors.danger,
              ...(Platform.OS === 'web'
                ? {
                    boxShadow: `0px 0px 10px ${isOnline ? theme.colors.success : theme.colors.danger}`,
                  }
                : {
                    shadowColor: isOnline ? theme.colors.success : theme.colors.danger,
                    shadowOpacity: 1,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 6,
                  }),
            },
          ]}
        />
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
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
