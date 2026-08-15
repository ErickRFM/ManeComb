import { formatSpeed } from '@shared/operational-contract';
import { makeOperationalUnitSnapshot } from '@/src/test-utils/operational-unit-snapshot';

describe('OperationalUnitSnapshot speed contract', () => {
  it('renders speedKmh without applying a second m/s conversion', () => {
    const unit = makeOperationalUnitSnapshot({
      gps: {
        ...makeOperationalUnitSnapshot().gps,
        speedKmh: 38,
      },
    });

    expect(formatSpeed(unit.gps)).toBe('38 km/h');
  });

  it('keeps missing speed distinct from a stopped unit', () => {
    const unit = makeOperationalUnitSnapshot({
      gps: {
        ...makeOperationalUnitSnapshot().gps,
        speedKmh: null,
      },
    });

    expect(formatSpeed(unit.gps)).toBe('—');
  });
});
