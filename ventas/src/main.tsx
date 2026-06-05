import './global.css';

import { AppRegistry } from 'react-native';
import { App } from './App';

AppRegistry.registerComponent('ManeCombVentas', () => App);

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontro el nodo root para montar ManeComb Ventas.');
}

AppRegistry.runApplication('ManeCombVentas', {
  rootTag: root,
});
