import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type ViewProps } from 'react-native';
import RNVideo, { type VideoRef, type OnLoadData, type OnProgressData, type OnBufferData, type OnVideoErrorData } from 'react-native-video';

type VideoSource = { uri: string; headers?: Record<string, string> } | null;

type PlayerStatus = {
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  isLoaded: boolean;
  error: string | null;
};

export function useVideoPlayer(
  source: VideoSource,
  setup?: (player: { loop: boolean }) => void,
) {
  const loopRef = useRef(false);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const [status, setStatus] = useState<PlayerStatus>({
    playing: false,
    currentTime: 0,
    duration: 0,
    isBuffering: true,
    isLoaded: false,
    error: null,
  });

  useEffect(() => {
    loopRef.current = false;
    const p = {
      get loop() { return loopRef.current; },
      set loop(v: boolean) { loopRef.current = v; },
    };
    setupRef.current?.(p);
    setStatus({ playing: false, currentTime: 0, duration: 0, isBuffering: true, isLoaded: false, error: null });
  }, [source]);

  return useMemo(() => ({
    get loop() { return loopRef.current; },
    status,
    setStatus,
    source,
  }), [status, source]);
}

type VideoViewProps = ViewProps & {
  player: ReturnType<typeof useVideoPlayer>;
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
  nativeControls?: boolean;
};

export function VideoView({
  style,
  player,
  nativeControls = true,
  ...props
}: VideoViewProps) {
  const ref = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(true);
  const [internalError, setInternalError] = useState<string | null>(null);

  useEffect(() => {
    setPaused(true);
    setInternalError(null);
  }, [player.source]);

  const rnSource = useMemo(() => {
    if (!player.source) return undefined;
    return {
      uri: player.source.uri,
      headers: player.source.headers,
      shouldCache: true,
    };
  }, [player.source]);

  if (!rnSource) return null;

  if (internalError) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 16 }]}>
        <Text style={{ color: '#fff', textAlign: 'center', fontSize: 14 }}>{internalError}</Text>
      </View>
    );
  }

  return (
    <RNVideo
      ref={ref}
      source={rnSource}
      style={style}
      paused={paused}
      resizeMode="contain"
      controls={nativeControls}
      repeat={player.loop}
      onLoad={(data: OnLoadData) => {
        player.setStatus(prev => ({ ...prev, duration: data.duration, isLoaded: true, isBuffering: false }));
      }}
      onProgress={(data: OnProgressData) => {
        player.setStatus(prev => ({ ...prev, currentTime: data.currentTime }));
      }}
      onBuffer={(data: OnBufferData) => {
        player.setStatus(prev => ({ ...prev, isBuffering: data.isBuffering }));
      }}
      onError={(e: OnVideoErrorData) => {
        const msg = e?.error?.errorString || 'Error al reproducir video';
        setInternalError(msg);
        player.setStatus(prev => ({ ...prev, error: msg, isBuffering: false }));
      }}
      onPlaybackStateChanged={(e) => {
        setPaused(!e.isPlaying);
        player.setStatus(prev => ({ ...prev, playing: e.isPlaying }));
      }}
      {...props}
    />
  );
}
