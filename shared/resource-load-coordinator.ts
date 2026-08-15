export type ResourceLoadCompletion = {
  isLatest: boolean;
  isLoading: boolean;
};

export function createResourceLoadCoordinator<Domain extends string>() {
  const activeCounts = new Map<Domain, number>();
  const generations = new Map<Domain, number>();

  return {
    begin(domain: Domain) {
      const generation = (generations.get(domain) || 0) + 1;
      generations.set(domain, generation);
      activeCounts.set(domain, (activeCounts.get(domain) || 0) + 1);
      return generation;
    },
    isLatest(domain: Domain, generation: number) {
      return generations.get(domain) === generation;
    },
    finish(domain: Domain, generation: number): ResourceLoadCompletion {
      const remaining = Math.max(0, (activeCounts.get(domain) || 1) - 1);
      if (remaining) activeCounts.set(domain, remaining);
      else activeCounts.delete(domain);
      return {
        isLatest: generations.get(domain) === generation,
        isLoading: activeCounts.size > 0,
      };
    },
    reset() {
      activeCounts.clear();
      generations.clear();
    },
  };
}

export function createLatestEffectCoordinator() {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    isLatest(candidate: number) {
      return candidate === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
}
