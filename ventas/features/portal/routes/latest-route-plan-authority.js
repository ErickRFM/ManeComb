export function createLatestRoutePlanAuthority() {
  let generation = 0;

  return {
    begin() {
      const requestGeneration = ++generation;
      let active = true;

      return {
        isCurrent() {
          return active && requestGeneration === generation;
        },
        invalidate() {
          if (!active) return;
          active = false;
          if (requestGeneration === generation) generation += 1;
        },
      };
    },
    invalidate() {
      generation += 1;
    },
  };
}
