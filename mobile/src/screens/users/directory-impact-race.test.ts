import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// `getApiErrorMessage` es la autoridad de copy del repo, pero arrastra el cliente
// axios y netinfo. Se sustituye por el fallback: aqui se prueba la maquina, no el
// formateo de mensajes, que ya tiene sus propias pruebas.
jest.mock('@/src/api/client', () => ({
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { useDirectoryImpactAction } from './use-directory-impact-action';

/**
 * La guarda de carrera vivia duplicada dentro de users-screen (una copia para
 * conductores y otra para unidades) y solo se podia comprobar leyendo el fuente.
 * Ahora existe una unica maquina, asi que se prueba su comportamiento real.
 */
type Impact = { id: string };

type Flow = ReturnType<typeof useDirectoryImpactAction<'delete', { id: string }, Impact>>;

function mountFlow(options: {
  loadImpact: (target: { id: string }) => Promise<Impact>;
  onReset?: () => void;
}) {
  const captured: { current: Flow | null } = { current: null };

  function Probe() {
    captured.current = useDirectoryImpactAction<'delete', { id: string }, Impact>({
      loadImpact: options.loadImpact,
      impactErrorMessage: 'fallback',
      onReset: options.onReset,
    });
    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });

  return {
    flow: () => captured.current as Flow,
    unmount: () => act(() => {
      (renderer as unknown as TestRenderer.ReactTestRenderer).unmount();
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

describe('Directory impact request authority', () => {
  it('descarta una respuesta fuera de orden y conserva la vigente', async () => {
    const first = deferred<Impact>();
    const second = deferred<Impact>();
    const responses = [first, second];
    let call = 0;
    const harness = mountFlow({ loadImpact: () => responses[call++].promise });

    await act(async () => {
      harness.flow().open('delete', { id: 'a' });
    });
    await act(async () => {
      harness.flow().open('delete', { id: 'b' });
    });

    // La segunda peticion resuelve primero y luego llega la primera, tardia.
    await act(async () => {
      second.resolve({ id: 'b' });
      await Promise.resolve();
    });
    await act(async () => {
      first.resolve({ id: 'a' });
      await Promise.resolve();
    });

    expect(harness.flow().impact).toEqual({ id: 'b' });
    expect(harness.flow().impactLoading).toBe(false);
  });

  it('cerrar invalida la peticion en vuelo', async () => {
    const pending = deferred<Impact>();
    const harness = mountFlow({ loadImpact: () => pending.promise });

    await act(async () => {
      harness.flow().open('delete', { id: 'a' });
    });
    act(() => {
      harness.flow().close();
    });
    await act(async () => {
      pending.resolve({ id: 'a' });
      await Promise.resolve();
    });

    expect(harness.flow().action).toBeNull();
    expect(harness.flow().impact).toBeNull();
  });

  it('un error tardio tampoco pisa el estado tras cerrar', async () => {
    const pending = deferred<Impact>();
    const harness = mountFlow({ loadImpact: () => pending.promise });

    await act(async () => {
      harness.flow().open('delete', { id: 'a' });
    });
    act(() => {
      harness.flow().close();
    });
    await act(async () => {
      pending.reject(new Error('tarde'));
      await Promise.resolve();
    });

    expect(harness.flow().impactError).toBeNull();
    expect(harness.flow().impactLoading).toBe(false);
  });

  it('no cierra mientras hay un envio en curso', async () => {
    const harness = mountFlow({ loadImpact: async () => ({ id: 'a' }) });

    await act(async () => {
      harness.flow().open('delete', { id: 'a' });
    });
    act(() => {
      harness.flow().setSubmitting(true);
    });
    act(() => {
      harness.flow().close();
    });

    expect(harness.flow().action).not.toBeNull();

    // `complete` si cierra: es el camino de exito.
    act(() => {
      harness.flow().complete();
    });
    expect(harness.flow().action).toBeNull();
    expect(harness.flow().submitting).toBe(false);
  });

  it('desmontar invalida cualquier peticion pendiente', async () => {
    const pending = deferred<Impact>();
    const harness = mountFlow({ loadImpact: () => pending.promise });

    await act(async () => {
      harness.flow().open('delete', { id: 'a' });
    });
    harness.unmount();

    // No debe avisar de una actualizacion sobre un componente desmontado.
    await act(async () => {
      pending.resolve({ id: 'a' });
      await Promise.resolve();
    });
  });

  it('abrir limpia el motivo y los campos propios del dominio', async () => {
    const onReset = jest.fn();
    const harness = mountFlow({ loadImpact: async () => ({ id: 'a' }), onReset });

    await act(async () => {
      harness.flow().open('delete', { id: 'a' });
    });
    act(() => {
      harness.flow().setReason('motivo largo');
    });
    expect(harness.flow().reason).toBe('motivo largo');

    await act(async () => {
      harness.flow().open('delete', { id: 'b' });
    });

    expect(harness.flow().reason).toBe('');
    expect(onReset).toHaveBeenCalled();
  });
});
