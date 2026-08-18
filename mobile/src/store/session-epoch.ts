/**
 * Contador de sesion. Se incrementa cada vez que la sesion se invalida
 * (`signOut`, expiracion). Toda tarea asincrona larga (`refreshAll`,
 * `initialize`) captura el valor al arrancar y descarta sus escrituras si el
 * contador cambio.
 *
 * Sin esta guarda, una sincronizacion en vuelo resolvia despues del logout y
 * reescribia `user` dejando `authContext` en null, lo que enrutaba a
 * `/sync-error` en pleno cierre de sesion. La ventana es amplia porque el
 * backend corre en el tier gratuito de Render y una peticion puede tardar
 * decenas de segundos.
 */
let sessionEpoch = 0;

type SessionEpochListener = (epoch: number) => void;
const sessionEpochListeners = new Set<SessionEpochListener>();

export function getSessionEpoch() {
  return sessionEpoch;
}

/**
 * Permite que limites de infraestructura (HTTP/SecureStore, por ejemplo)
 * reaccionen sincronicamente al MISMO epoch que usa el store. No crea una
 * segunda autoridad de autenticacion: solo distribuye la invalidacion que ya
 * decidio el root-store.
 */
export function subscribeSessionEpoch(listener: SessionEpochListener) {
  sessionEpochListeners.add(listener);
  return () => sessionEpochListeners.delete(listener);
}

/** Invalida la sesion vigente y devuelve el nuevo epoch. */
export function beginSessionEpoch() {
  sessionEpoch += 1;

  sessionEpochListeners.forEach((listener) => {
    try {
      listener(sessionEpoch);
    } catch {
      // Una barrera auxiliar nunca puede impedir que la autoridad invalide la
      // sesion. Los listeners son fail-closed en su propio dominio.
    }
  });

  return sessionEpoch;
}

/** Verdadero si la sesion cambio desde que se capturo `epoch`. */
export function isSessionEpochStale(epoch: number) {
  return epoch !== sessionEpoch;
}

/** Solo para pruebas: reinicia el contador. */
export function resetSessionEpochForTests() {
  sessionEpoch = 0;
}
