/**
 * Regla unica de madurez de un candidato de ruta aprendida.
 *
 * Vive aqui, y no dentro de cada store, porque `data/store.js` (embebido) y
 * `data/mongo-store.js` (produccion) tienen que promover un candidato con el
 * mismo criterio. Duplicar la condicion en los dos era la via mas rapida a que
 * las pruebas pasaran en memoria y produccion se comportara distinto.
 *
 * "Uso habitual" es un hecho temporal, no solo un conteo. Tres vueltas la misma
 * manana son un servicio; tres vueltas repartidas en dias distintos son un
 * patron. Por eso la evidencia exige ambas cosas.
 *
 * El dia operativo lo calcula `utils/service-date.js` en la zona de operacion,
 * no en UTC, para que un turno nocturno no se parta en dos por el meridiano.
 */

/**
 * Confianza mostrada al administrador.
 *
 * Progresa con la dimension MAS ATRASADA de la evidencia: si sobran recorridos
 * pero falta un dia operativo, la confianza no puede parecer completa. Asi el
 * numero no promete mas de lo que la evidencia sostiene.
 */
function learnedRouteConfidence({ evidenceCount, distinctServiceDays }, { minimumEvidenceCount, minimumDistinctServiceDays }) {
  const countRatio = Math.min(1, (Number(evidenceCount) || 0) / Math.max(1, minimumEvidenceCount));
  const dayRatio = Math.min(1, (Number(distinctServiceDays) || 0) / Math.max(1, minimumDistinctServiceDays));
  return Math.round(Math.min(countRatio, dayRatio) * 100) / 100;
}

/** Un candidato solo se ofrece a revision cuando cumple ambas dimensiones. */
function isLearnedRouteReadyForReview({ evidenceCount, distinctServiceDays }, { minimumEvidenceCount, minimumDistinctServiceDays }) {
  return (Number(evidenceCount) || 0) >= minimumEvidenceCount &&
    (Number(distinctServiceDays) || 0) >= minimumDistinctServiceDays;
}

module.exports = {
  isLearnedRouteReadyForReview,
  learnedRouteConfidence
};
