export type RoutePlanRequestAuthority = {
  isCurrent(): boolean;
  invalidate(): void;
};

export function createLatestRoutePlanAuthority(): {
  begin(): RoutePlanRequestAuthority;
  invalidate(): void;
};
