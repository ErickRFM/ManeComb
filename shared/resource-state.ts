export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'stale' | 'error';
export type ResourceSource = 'rest' | 'realtime' | 'cache' | null;

export type ResourceState = {
  status: ResourceStatus;
  isRefreshing: boolean;
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  source: ResourceSource;
  errorCode: string | null;
  errorMessage: string | null;
};

export const idleResourceState = (): ResourceState => ({
  status: 'idle',
  isRefreshing: false,
  lastAttemptAt: null,
  lastSuccessfulAt: null,
  source: null,
  errorCode: null,
  errorMessage: null,
});

export function beginResourceAttempt(current: ResourceState, attemptedAt = new Date().toISOString()): ResourceState {
  return {
    ...current,
    status: current.lastSuccessfulAt ? current.status : 'loading',
    isRefreshing: Boolean(current.lastSuccessfulAt),
    lastAttemptAt: attemptedAt,
    errorCode: null,
    errorMessage: null,
  };
}

export function completeResourceAttempt(
  current: ResourceState,
  options: { empty: boolean; source: Exclude<ResourceSource, null>; completedAt?: string },
): ResourceState {
  const completedAt = options.completedAt || new Date().toISOString();
  return {
    status: options.empty ? 'empty' : 'ready',
    isRefreshing: false,
    lastAttemptAt: current.lastAttemptAt || completedAt,
    lastSuccessfulAt: completedAt,
    source: options.source,
    errorCode: null,
    errorMessage: null,
  };
}

export function failResourceAttempt(
  current: ResourceState,
  options: { errorCode: string; errorMessage: string },
): ResourceState {
  return {
    ...current,
    status: current.lastSuccessfulAt ? 'stale' : 'error',
    isRefreshing: false,
    errorCode: options.errorCode,
    errorMessage: options.errorMessage,
  };
}

export function applyIncrementalResourceEvent(current: ResourceState): ResourceState {
  if (!current.lastSuccessfulAt || current.status === 'stale' || current.status === 'error') {
    return current;
  }
  return { ...current, source: 'realtime' };
}
