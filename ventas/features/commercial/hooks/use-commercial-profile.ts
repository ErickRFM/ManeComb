import { useCallback, useEffect, useState } from 'react';
import { getCommercialProfileRequest } from '@/src/api/client';
import type { CommercialPublicProfile } from '@/src/types/app';

export function useCommercialProfile() {
  const [profile, setProfile] = useState<CommercialPublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setProfile(await getCommercialProfileRequest());
    } catch {
      setError('No pudimos cargar los datos de contacto de ManeComb.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profile, isLoading, error, reload };
}
