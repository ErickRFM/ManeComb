export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'stale' | 'error';
export type ResourceSource = 'rest' | 'realtime' | 'cache' | null;

export type ResourceState = {
  status: ResourceStatus;
  lastSuccessfulAt: string | null;
  source: ResourceSource;
  errorCode: string | null;
  errorMessage: string | null;
};

export const idleResourceState = (): ResourceState => ({
  status: 'idle',
  lastSuccessfulAt: null,
  source: null,
  errorCode: null,
  errorMessage: null,
});
