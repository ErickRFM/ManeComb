const DESKTOP_WORKSPACE_MIN_WIDTH = 1180;
const WORKSPACE_VERTICAL_CHROME = 198;
const CATALOG_FIXED_CONTROLS_HEIGHT = 150;

export type RouteWorkspaceSizing = {
  expanded: boolean;
  minHeight: number;
  catalogListHeight: number;
};

/**
 * Desktop route workspace sizing.
 *
 * Keeps the current responsive behavior on narrower screens, but on wide web
 * layouts uses the remaining viewport height instead of stopping at the old
 * fixed 560 px floor. This lets the map and side panels consume the space that
 * was otherwise left empty below the workspace.
 */
export function getRouteWorkspaceSizing(width: number, height: number): RouteWorkspaceSizing {
  const expanded = width >= DESKTOP_WORKSPACE_MIN_WIDTH;
  const minHeight = expanded
    ? Math.max(560, Math.floor(height - WORKSPACE_VERTICAL_CHROME))
    : 560;

  return {
    expanded,
    minHeight,
    catalogListHeight: expanded
      ? Math.max(420, minHeight - CATALOG_FIXED_CONTROLS_HEIGHT)
      : 420,
  };
}
