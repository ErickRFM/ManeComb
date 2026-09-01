import { journeyStatusLabelForStatus } from '@shared/operational-contract';

describe('journey status presentation authority', () => {
  it.each([
    ['ASSIGNED', 'Asignada'],
    ['READY', 'Lista para iniciar'],
    ['RUNNING', 'En jornada'],
    ['PAUSED', 'Pausada'],
    ['FINISHED', 'Finalizada'],
    ['CANCELLED', 'Cancelada'],
  ])('presenta %s desde el contrato compartido', (status, label) => {
    expect(journeyStatusLabelForStatus(status)).toBe(label);
  });

  it('conserva un fallback legible sin inventar un estado backend', () => {
    expect(journeyStatusLabelForStatus(null)).toBe('Sin estado');
    expect(journeyStatusLabelForStatus('WAITING_REVIEW')).toBe('WAITING REVIEW');
  });
});
