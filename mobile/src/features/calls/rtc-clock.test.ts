import {
  __resetRtcServerClockForTests,
  calibrateRtcServerClock,
  getRtcServerNowMs,
  normalizeRtcDeadline,
  RTC_CLOCK_CALIBRATION_MAX_AGE_MS,
} from './rtc-clock';

beforeEach(() => __resetRtcServerClockForTests());
afterEach(() => __resetRtcServerClockForTests());

describe('RTC server clock calibration', () => {
  it('corrige un telefono adelantado dos minutos sin acortar ringing', () => {
    const localAtCalibration = Date.parse('2026-08-10T01:02:00.000Z');
    const serverAtCalibration = '2026-08-10T01:00:00.000Z';
    expect(calibrateRtcServerClock(serverAtCalibration, localAtCalibration, 100)).toBe(true);

    const localNow = localAtCalibration + 500;
    const normalized = normalizeRtcDeadline(
      '2026-08-10T01:00:35.000Z',
      localNow,
      600
    );

    expect(Date.parse(normalized!)-localNow).toBe(34_500);
    expect(getRtcServerNowMs(localNow, 600)).toBe(Date.parse(serverAtCalibration) + 500);
  });

  it('corrige un telefono atrasado dos minutos sin alargar ringing', () => {
    const localAtCalibration = Date.parse('2026-08-10T00:58:00.000Z');
    const serverAtCalibration = '2026-08-10T01:00:00.000Z';
    calibrateRtcServerClock(serverAtCalibration, localAtCalibration, 10);

    const localNow = localAtCalibration + 5_000;
    const normalized = normalizeRtcDeadline(
      '2026-08-10T01:00:35.000Z',
      localNow,
      5_010
    );

    expect(Date.parse(normalized!)-localNow).toBe(30_000);
  });

  it('descarta calibracion vieja y vuelve al deadline original', () => {
    const local = Date.parse('2026-08-10T01:00:00.000Z');
    calibrateRtcServerClock('2026-08-10T01:00:00.000Z', local, 0);
    const original = '2026-08-10T01:01:30.000Z';

    expect(normalizeRtcDeadline(
      original,
      local + RTC_CLOCK_CALIBRATION_MAX_AGE_MS + 1,
      RTC_CLOCK_CALIBRATION_MAX_AGE_MS + 1
    )).toBe(original);
  });

  it('invalida la muestra si el reloj de pared cambia despues de calibrar', () => {
    const local = Date.parse('2026-08-10T01:00:00.000Z');
    calibrateRtcServerClock('2026-08-10T01:00:00.000Z', local, 100);

    expect(getRtcServerNowMs(local + 120_000, 1_100)).toBe(local + 120_000);
  });
});
