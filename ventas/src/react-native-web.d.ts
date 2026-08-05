declare module 'react-native' {
  import type { Component, ComponentType } from 'react';

  export type ViewStyle = Record<string, unknown>;
  export type TextStyle = Record<string, unknown>;
  export type ImageStyle = Record<string, unknown>;
  export type StyleProp<T> = T | T[] | false | null | undefined;

  export type NativeScrollEvent = {
    contentOffset: { x: number; y: number };
    contentSize: { width: number; height: number };
    layoutMeasurement: { width: number; height: number };
  };
  export type NativeSyntheticEvent<T> = { nativeEvent: T };

  export const ActivityIndicator: ComponentType<any>;
  export const Image: ComponentType<any>;
  export const Modal: ComponentType<any>;
  export const Pressable: ComponentType<any>;
  export class ScrollView extends Component<any> {
    scrollTo(options?: any): void;
  }
  export const StatusBar: ComponentType<any>;
  export const Text: ComponentType<any>;
  export const TextInput: ComponentType<any>;
  export const View: ComponentType<any>;

  export const Easing: any;
  export const Linking: { openURL(url: string): Promise<unknown> };
  export const Share: { share(content: { message: string }): Promise<unknown> };
  export const Platform: {
    OS: string;
    select<T>(options: Record<string, T>): T | undefined;
  };
  export const StyleSheet: {
    absoluteFillObject: Record<string, unknown>;
    create<T extends Record<string, any>>(styles: T): T;
  };

  export namespace Animated {
    class Value {
      constructor(value: number);
      interpolate(config: any): any;
    }
    const View: ComponentType<any>;
    function loop(animation: any): { start(): void; stop(): void };
    function parallel(animations: any[]): { start(callback?: () => void): void; stop(): void };
    function sequence(animations: any[]): any;
    function timing(value: Value, config: any): any;
  }

  export function useWindowDimensions(): { width: number; height: number; scale: number; fontScale: number };
}

declare module 'react-native-safe-area-context' {
  import type { ComponentType } from 'react';
  export const SafeAreaProvider: ComponentType<any>;
  export const SafeAreaView: ComponentType<any>;
  export function useSafeAreaInsets(): { top: number; right: number; bottom: number; left: number };
}

declare module 'react-native-svg' {
  import type { ComponentType } from 'react';
  export const SvgXml: ComponentType<{ xml: string; width?: number | string; height?: number | string }>;
}
