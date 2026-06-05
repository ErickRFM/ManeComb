declare module 'react-native-config' {
  const Config: Record<string, string | undefined>;
  export default Config;
}

declare const process: {
  env: Record<string, string | undefined>;
};
