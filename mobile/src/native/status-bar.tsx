import React from 'react';
import { StatusBar as NativeStatusBar, type StatusBarProps } from 'react-native';

type StatusStyle = 'auto' | 'inverted' | 'light' | 'dark';

type Props = Omit<StatusBarProps, 'barStyle'> & {
  style?: StatusStyle;
};

function toNativeStyle(style: StatusStyle | undefined) {
  if (style === 'light') {
    return 'light-content' as const;
  }

  return 'dark-content' as const;
}

export function StatusBar({ style = 'auto', ...props }: Props) {
  return <NativeStatusBar {...props} barStyle={toNativeStyle(style)} />;
}
