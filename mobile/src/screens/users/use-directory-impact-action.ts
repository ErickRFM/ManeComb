import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/src/api/client';

/**
 * Maquina de interaccion de una accion de Directorio que exige revisar impacto
 * antes de confirmar.
 *
 * Conductores y unidades la repetian entera: `action`, `impact`, `impactLoading`,
 * `impactError`, `submitting`, `reason` y —lo delicado— una guarda de carrera por
 * `requestId` duplicada en dos sitios, con el riesgo de tener que arreglar dos
 * veces cualquier fallo de carrera (ver `directory-impact-race.test.ts`).
 *
 * Aqui vive SOLO la interaccion. Deliberadamente NO posee:
 *  - las guardas de confirmacion, que siguen en `directory-action-state.ts`;
 *  - que peticion ejecuta cada accion ni sus mensajes, que son de dominio;
 *  - campos propios de un dominio, como la confirmacion escrita del conductor,
 *    que el llamador limpia mediante `onReset`.
 *
 * Asi se reutiliza comportamiento sin mezclar reglas de dominio ni introducir
 * ramas por tipo dentro del hook.
 */
export type DirectoryImpactAction<TKind, TTarget> = {
  kind: TKind;
  target: TTarget;
};

type Options<TTarget, TImpact> = {
  /** Peticion de impacto del dominio. */
  loadImpact: (target: TTarget) => Promise<TImpact>;
  /** Texto de respaldo cuando la peticion de impacto falla sin mensaje propio. */
  impactErrorMessage: string;
  /** Limpieza de campos que pertenecen al dominio del llamador. */
  onReset?: () => void;
};

export function useDirectoryImpactAction<TKind, TTarget, TImpact>({
  loadImpact,
  impactErrorMessage,
  onReset,
}: Options<TTarget, TImpact>) {
  const [action, setAction] = useState<DirectoryImpactAction<TKind, TTarget> | null>(null);
  const [impact, setImpact] = useState<TImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  // Una respuesta tardia de un impacto anterior no debe pisar el vigente ni
  // reactivar el loading del actual.
  const requestId = useRef(0);

  const loadImpactRef = useRef(loadImpact);
  loadImpactRef.current = loadImpact;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    []
  );

  const reload = useCallback(
    async (target: TTarget) => {
      const currentRequest = ++requestId.current;
      setImpact(null);
      setImpactError(null);
      setImpactLoading(true);
      try {
        const nextImpact = await loadImpactRef.current(target);
        if (currentRequest !== requestId.current) return;
        setImpact(nextImpact);
      } catch (error) {
        if (currentRequest !== requestId.current) return;
        setImpactError(getApiErrorMessage(error, impactErrorMessage));
      } finally {
        if (currentRequest === requestId.current) setImpactLoading(false);
      }
    },
    [impactErrorMessage]
  );

  const clear = useCallback(() => {
    requestId.current += 1;
    setAction(null);
    setImpact(null);
    setImpactError(null);
    // Al invalidar la peticion, el `finally` de `reload` ya no baja el loading:
    // se apaga aqui para no dejar el flujo cerrado con carga colgada. Sin efecto
    // visible, porque reabrir vuelve a encenderlo.
    setImpactLoading(false);
    setReason('');
    onResetRef.current?.();
  }, []);

  const open = useCallback(
    (kind: TKind, target: TTarget) => {
      setAction({ kind, target });
      setReason('');
      onResetRef.current?.();
      void reload(target);
    },
    [reload]
  );

  /** No cierra a mitad de un envio: el usuario perderia el resultado. */
  const close = useCallback(() => {
    if (submitting) return;
    clear();
  }, [clear, submitting]);

  /** Cierre tras un envio correcto, sin la guarda de `submitting`. */
  const complete = useCallback(() => {
    setSubmitting(false);
    clear();
  }, [clear]);

  return {
    action,
    impact,
    impactError,
    impactLoading,
    reason,
    submitting,
    close,
    complete,
    open,
    reload,
    setReason,
    setSubmitting,
  };
}
