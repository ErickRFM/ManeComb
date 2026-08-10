export type PanelRevealTarget = 'details' | 'history' | null;

export function requestPanelReveal(
  pending: PanelRevealTarget,
  target: Exclude<PanelRevealTarget, null>,
  targetIsOpen: boolean
): PanelRevealTarget {
  if (targetIsOpen) return pending === target ? null : pending;
  return target;
}

export function cancelPanelReveal(): PanelRevealTarget {
  return null;
}

export function consumePanelReveal(
  pending: PanelRevealTarget,
  laidOutTarget: Exclude<PanelRevealTarget, null>
) {
  if (pending !== laidOutTarget) {
    return { pending, shouldScroll: false };
  }
  return { pending: null as PanelRevealTarget, shouldScroll: true };
}
