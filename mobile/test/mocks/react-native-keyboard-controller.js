const React = require('react');
const { ScrollView, View } = require('react-native');

const KeyboardAvoidingView = React.forwardRef(function KeyboardAvoidingViewMock(
  { children, ...props },
  ref
) {
  return React.createElement(View, { ...props, ref }, children);
});

const KeyboardAwareScrollView = React.forwardRef(function KeyboardAwareScrollViewMock(
  { children, ...props },
  ref
) {
  return React.createElement(ScrollView, { ...props, ref }, children);
});

function KeyboardProvider({ children }) {
  return React.createElement(React.Fragment, null, children);
}

module.exports = {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardProvider,
};
