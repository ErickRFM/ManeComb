import {
  shouldAlertForIncidentUpdate,
  toOperationalAlertFromNotification,
  toOperationalAlertFromSos,
} from './operational-alert';

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    title: 'SOS activo: Accidente',
    body: 'Erik reporto accidente.',
    level: 'critical',
    category: 'sos',
    data: {
      incidentId: 'inc-1',
      severity: 'critical',
      type: 'accidente',
      category: 'sos',
      deepLink: '/incidencias?incidentId=inc-1&focus=sos',
    },
    ...overrides,
  };
}

describe('alertas operativas en foreground', () => {
  it('reconoce un SOS y conserva el level resuelto por backend', () => {
    expect(toOperationalAlertFromNotification(notification())).toEqual({
      incidentId: 'inc-1',
      category: 'sos',
      level: 'critical',
      severity: 'critical',
      title: 'SOS activo: Accidente',
      body: 'Erik reporto accidente.',
      deepLink: '/incidencias?incidentId=inc-1&focus=sos',
    });
  });

  it('reconoce una incidencia de alta y una informativa', () => {
    const high = toOperationalAlertFromNotification(
      notification({
        category: 'incident',
        level: 'warning',
        data: { incidentId: 'inc-2', severity: 'high', category: 'incident' },
      })
    );
    expect(high).toEqual({
      incidentId: 'inc-2',
      category: 'incident',
      level: 'warning',
      severity: 'high',
      title: 'SOS activo: Accidente',
      body: 'Erik reporto accidente.',
      deepLink: '/incidencias',
    });

    const info = toOperationalAlertFromNotification(
      notification({
        category: 'incident',
        level: 'info',
        data: { incidentId: 'inc-3', severity: 'low', category: 'incident' },
      })
    );
    expect(info?.level).toBe('info');
  });

  it('no confunde chat ni llamadas con una alerta operativa', () => {
    expect(
      toOperationalAlertFromNotification(
        notification({ category: 'chat', level: 'info', data: { conversationId: 'conv-1' } })
      )
    ).toBeNull();
    expect(
      toOperationalAlertFromNotification(
        notification({ category: 'call', level: 'critical', data: { callId: 'call-1' } })
      )
    ).toBeNull();
  });

  it('ignora payloads sin identidad utilizable', () => {
    expect(toOperationalAlertFromNotification(null)).toBeNull();
    expect(toOperationalAlertFromNotification({})).toBeNull();
    expect(
      toOperationalAlertFromNotification({ category: 'incident', level: 'info', data: {} })
    ).toBeNull();
  });

  it('dos incidencias con el mismo titulo son alertas distintas', () => {
    // La identidad es el incidentId; el titulo puede repetirse sin colapsarlas.
    const first = toOperationalAlertFromNotification(
      notification({ data: { incidentId: 'inc-a', severity: 'critical', category: 'sos' } })
    );
    const second = toOperationalAlertFromNotification(
      notification({ data: { incidentId: 'inc-b', severity: 'critical', category: 'sos' } })
    );

    expect(first?.incidentId).toBe('inc-a');
    expect(second?.incidentId).toBe('inc-b');
    expect(first?.incidentId).not.toBe(second?.incidentId);
  });

  it('incident:sos comparte identidad con su notificacion', () => {
    // Mismo incidentId que notification:created, para que el dedup nativo deje
    // una sola reaccion aunque lleguen los dos eventos.
    const fromEnvelope = toOperationalAlertFromSos({
      incident: { id: 'inc-1', severity: 'critical' },
      notification: notification(),
    });
    expect(fromEnvelope?.incidentId).toBe('inc-1');

    const withoutNotification = toOperationalAlertFromSos({
      incident: { id: 'inc-9', severity: 'critical' },
    });
    expect(withoutNotification).toEqual({
      incidentId: 'inc-9',
      category: 'sos',
      level: 'critical',
      severity: 'critical',
      title: 'Alerta SOS de ManeComb',
      body: 'Nueva alerta SOS operativa.',
      deepLink: '/incidencias?incidentId=inc-9&focus=sos',
    });

    expect(toOperationalAlertFromSos({})).toBeNull();
  });

  it('un cambio de estado nunca es una alerta nueva', () => {
    // open -> in_progress y resolved no deben repetir sirena. Backend tampoco
    // emite notificacion en esas transiciones.
    expect(shouldAlertForIncidentUpdate()).toBe(false);
  });
});
