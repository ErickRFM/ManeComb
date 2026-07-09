import { useEffect, useState } from 'react';
import type { User } from '@/src/types/app';
import { getOperationalScheduleState } from '@/src/utils/operational-schedule';

export function useScheduleTick(operationalSchedule: User['operationalSchedule'] | null | undefined) {
  const [, setScheduleTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setScheduleTick((current) => current + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  return getOperationalScheduleState(operationalSchedule || null, new Date());
}
