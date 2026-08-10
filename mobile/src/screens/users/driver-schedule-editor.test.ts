import {
  adjustDriverScheduleClock,
  createDriverScheduleDraft,
  driverScheduleCrossesMidnight,
  driverScheduleDraftEquals,
  formatDriverScheduleDays,
  formatDriverScheduleSummary,
  getDriverScheduleDurationMinutes,
} from './driver-schedule-editor';

describe('editor de horario del Directorio', () => {
  it('usa formato 24 h y ajusta minutos sin texto ambiguo', () => {
    expect(adjustDriverScheduleClock('18:00', 60)).toBe('19:00');
    expect(adjustDriverScheduleClock('23:55', 5)).toBe('00:00');
    expect(adjustDriverScheduleClock('00:00', -5)).toBe('23:55');
  });

  it('interpreta 18:00 a 01:00 como siete horas y cruce al dia siguiente', () => {
    expect(getDriverScheduleDurationMinutes('18:00', '01:00')).toBe(7 * 60);
    expect(driverScheduleCrossesMidnight('18:00', '01:00')).toBe(true);
    expect(
      formatDriverScheduleSummary({
        activeDays: [1, 2, 3, 4, 5, 6],
        enabled: true,
        startTime: '18:00',
        endTime: '01:00',
        timezone: null,
      })
    ).toBe('Lun–Sáb · 18:00 → 01:00 · 7 h · termina al día siguiente');
  });

  it('hace explicita la ventana de 24 h cuando inicio y fin coinciden', () => {
    expect(getDriverScheduleDurationMinutes('08:00', '08:00')).toBe(24 * 60);
    expect(
      formatDriverScheduleSummary({
        activeDays: [1, 2, 3, 4, 5, 6, 0],
        enabled: true,
        startTime: '08:00',
        endTime: '08:00',
        timezone: null,
      })
    ).toContain('ventana de 24 h');
  });

  it('resume los dias operativos mas comunes', () => {
    expect(formatDriverScheduleDays([1, 2, 3, 4, 5])).toBe('Lun–Vie');
    expect(formatDriverScheduleDays([1, 2, 3, 4, 5, 6])).toBe('Lun–Sáb');
    expect(formatDriverScheduleDays([1, 2, 3, 4, 5, 6, 0])).toBe('Todos los días');
  });

  it('preserva una zona existente y usa defaults claros para un horario nuevo', () => {
    expect(createDriverScheduleDraft(null)).toEqual({
      activeDays: [1, 2, 3, 4, 5, 6, 0],
      enabled: true,
      endTime: '18:00',
      startTime: '08:00',
      timezone: null,
    });

    expect(
      createDriverScheduleDraft({
        activeDays: [1, 2],
        enabled: false,
        startTime: '22:30',
        endTime: '05:15',
        timezone: 'America/Mexico_City',
      }).timezone
    ).toBe('America/Mexico_City');
  });

  it('solo habilita guardar cuando hay un cambio real', () => {
    const schedule = {
      activeDays: [1, 2, 3, 4, 5],
      enabled: true,
      startTime: '08:00',
      endTime: '18:00',
      timezone: null,
    };
    const draft = createDriverScheduleDraft(schedule);
    expect(driverScheduleDraftEquals(draft, schedule)).toBe(true);
    expect(driverScheduleDraftEquals({ ...draft, endTime: '19:00' }, schedule)).toBe(false);
  });
});
