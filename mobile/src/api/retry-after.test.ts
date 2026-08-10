import { formatRetryAfter, parseRetryAfterSeconds } from './retry-after';

describe('Retry-After contract', () => {
  it('prefers the structured limiter payload', () => {
    expect(parseRetryAfterSeconds({
      data: { retryAfterSeconds: 75 },
      headers: { 'retry-after': '10' },
    })).toBe(75);
    expect(formatRetryAfter(75)).toBe('2 min');
  });

  it('supports seconds and HTTP-date headers', () => {
    expect(parseRetryAfterSeconds({ headers: { 'retry-after': '12' } })).toBe(12);
    expect(parseRetryAfterSeconds(
      { headers: { 'retry-after': 'Sun, 10 Aug 2026 08:00:30 GMT' } },
      Date.parse('Sun, 10 Aug 2026 08:00:00 GMT')
    )).toBe(30);
    expect(formatRetryAfter(12)).toBe('12 s');
  });
});
