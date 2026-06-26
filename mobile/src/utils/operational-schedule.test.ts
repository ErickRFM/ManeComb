import { getOperationalScheduleState, normalizeOperationalSchedule } from './operational-schedule';

describe('operational schedule', () => {
  it('keeps current behavior when no schedule is configured', () => {
    const state = getOperationalScheduleState(null, new Date('2026-06-26T12:00:00'));

    expect(state.isConfigured).toBe(false);
    expect(state.isWithinSchedule).toBe(true);
  });

  it('allows operations inside configured hours', () => {
    const state = getOperationalScheduleState(
      {
        activeDays: [5],
        enabled: true,
        endTime: '18:00',
        startTime: '08:00',
        timezone: null,
      },
      new Date('2026-06-26T12:00:00')
    );

    expect(state.isWithinSchedule).toBe(true);
    expect(state.label).toBe('Dentro de horario');
  });

  it('blocks operations outside configured hours', () => {
    const state = getOperationalScheduleState(
      {
        activeDays: [5],
        enabled: true,
        endTime: '18:00',
        startTime: '08:00',
        timezone: null,
      },
      new Date('2026-06-26T20:00:00')
    );

    expect(state.isWithinSchedule).toBe(false);
    expect(state.reason).toBe('outside_hours');
  });

  it('supports overnight shifts', () => {
    const state = getOperationalScheduleState(
      {
        activeDays: [5],
        enabled: true,
        endTime: '06:00',
        startTime: '22:00',
        timezone: null,
      },
      new Date('2026-06-26T23:30:00')
    );

    expect(state.isWithinSchedule).toBe(true);
  });

  it('rejects invalid hour format', () => {
    expect(normalizeOperationalSchedule({ startTime: '7:00', endTime: '18:00' })).toBeNull();
  });
});
