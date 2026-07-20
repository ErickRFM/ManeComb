import {
  beginSessionEpoch,
  getSessionEpoch,
  isSessionEpochStale,
  resetSessionEpochForTests,
} from './session-epoch';

describe('session epoch', () => {
  beforeEach(() => {
    resetSessionEpochForTests();
  });

  it('considera vigente el epoch capturado mientras la sesion no cambie', () => {
    const epoch = getSessionEpoch();

    expect(isSessionEpochStale(epoch)).toBe(false);
  });

  it('invalida el epoch capturado cuando la sesion se cierra', () => {
    // Una sincronizacion arranca y captura el epoch vigente...
    const inFlightEpoch = getSessionEpoch();

    // ...el usuario cierra sesion mientras la peticion sigue en vuelo...
    beginSessionEpoch();

    // ...por lo que la sincronizacion debe descartar sus escrituras al resolver.
    expect(isSessionEpochStale(inFlightEpoch)).toBe(true);
  });

  it('mantiene invalidos los epochs previos tras varios cierres de sesion', () => {
    const first = getSessionEpoch();
    const second = beginSessionEpoch();
    beginSessionEpoch();

    expect(isSessionEpochStale(first)).toBe(true);
    expect(isSessionEpochStale(second)).toBe(true);
    expect(isSessionEpochStale(getSessionEpoch())).toBe(false);
  });

  it('deja vigente el epoch nuevo que arranca despues del cierre de sesion', () => {
    beginSessionEpoch();
    // El siguiente `initialize` captura el epoch ya invalidado y sigue vigente.
    const afterSignOut = getSessionEpoch();

    expect(isSessionEpochStale(afterSignOut)).toBe(false);
  });
});
