import React from 'react';
import { View, type ViewProps } from 'react-native';

type VideoSource = { uri: string; headers?: Record<string, string> } | null;

export function useVideoPlayer(source: VideoSource, setup?: (player: { loop: boolean }) => void) {
  const player = React.useMemo(
    () => ({
      source,
      loop: false,
      play: () => undefined,
      pause: () => undefined,
    }),
    [source]
  );

  React.useEffect(() => {
    setup?.(player);
  }, [player, setup]);

  return player;
}

type VideoViewProps = ViewProps & {
  player: ReturnType<typeof useVideoPlayer>;
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
  nativeControls?: boolean;
};

export function VideoView({
  style,
  player: _player,
  allowsFullscreen: _allowsFullscreen,
  allowsPictureInPicture: _allowsPictureInPicture,
  nativeControls: _nativeControls,
  ...props
}: VideoViewProps) {
  return <View {...props} style={style} />;
}
