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
        cancel() {
          if (!active) return;
          active = false;
          if (requestGeneration === generation) generation += 1;
        },
      };
    },
  };
}
