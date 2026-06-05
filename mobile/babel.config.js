module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@': './',
          ventas: '../ventas',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
