import type { ProfileSection } from './profile.types';

export function getProfileSection(value: string | string[] | undefined): ProfileSection {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (['empresa', 'seguridad', 'soporte'].includes(String(normalized || ''))) {
    return normalized as ProfileSection;
  }

  return 'resumen';
}
