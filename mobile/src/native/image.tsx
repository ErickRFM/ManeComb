import React from 'react';
import { Image as NativeImage, type ImageProps, type ImageResizeMode } from 'react-native';

type ContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

type Props = Omit<ImageProps, 'source'> & {
  source: ImageProps['source'] | string;
  contentFit?: ContentFit;
};

function normalizeResizeMode(contentFit?: ContentFit): ImageResizeMode | undefined {
  if (contentFit === 'contain' || contentFit === 'cover') {
    return contentFit;
  }

  if (contentFit === 'fill') {
    return 'stretch';
  }

  return undefined;
}

export function Image({ source, contentFit, resizeMode, ...props }: Props) {
  const normalizedSource = typeof source === 'string' ? { uri: source } : source;
  return (
    <NativeImage
      {...props}
      source={normalizedSource}
      resizeMode={resizeMode || normalizeResizeMode(contentFit)}
    />
  );
}
