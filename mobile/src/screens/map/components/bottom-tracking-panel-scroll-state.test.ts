import {
  cancelPanelReveal,
  consumePanelReveal,
  requestPanelReveal,
  type PanelRevealTarget,
} from './bottom-tracking-panel-scroll-state';

describe('coordinacion de scroll de BottomTrackingPanel', () => {
  it('collapse y cambio de unidad cancelan cualquier reveal pendiente', () => {
    const pending = requestPanelReveal(null, 'details', false);
    expect(pending).toBe('details');
    expect(cancelPanelReveal()).toBeNull();
    expect(consumePanelReveal(cancelPanelReveal(), 'details').shouldScroll).toBe(false);
  });

  it('details seguido rapidamente por history solo revela history', () => {
    let pending = requestPanelReveal(null, 'details', false);
    pending = requestPanelReveal(pending, 'history', false);

    const staleDetailsLayout = consumePanelReveal(pending, 'details');
    expect(staleDetailsLayout).toEqual({ pending: 'history', shouldScroll: false });
    expect(consumePanelReveal(staleDetailsLayout.pending, 'history')).toEqual({
      pending: null,
      shouldScroll: true,
    });
  });

  it('abrir y cerrar repetidamente no acumula intenciones de scroll', () => {
    let pending: PanelRevealTarget = null;
    let isOpen = false;
    for (let index = 0; index < 10; index += 1) {
      pending = requestPanelReveal(pending, 'details', isOpen);
      isOpen = !isOpen;
      if (isOpen) pending = consumePanelReveal(pending, 'details').pending;
    }
    expect(pending).toBeNull();
    expect(isOpen).toBe(false);
  });

  it('consume exactamente una medicion de la seccion solicitada', () => {
    const first = consumePanelReveal(requestPanelReveal(null, 'history', false), 'history');
    expect(first.shouldScroll).toBe(true);
    expect(consumePanelReveal(first.pending, 'history').shouldScroll).toBe(false);
  });
});
