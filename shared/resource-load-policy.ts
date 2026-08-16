export function shouldSkipResourceLoad(options: {
  scope: 'full' | 'domain';
  force?: boolean;
  scopeChanged?: boolean;
  lastFullLoadAt: number;
  now: number;
  ttlMs: number;
}) {
  if (options.scope === 'domain' || options.force || options.scopeChanged || !options.lastFullLoadAt) return false;
  return options.now - options.lastFullLoadAt < options.ttlMs;
}
