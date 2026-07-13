import type {
  AccountType,
  ChatMessage,
  ConversationSummary,
  DocumentItem,
  Incident,
  IncidentDraft,
  IncidentStatus,
  LiveLocationsData,
  NotificationItem,
  PaymentProfile,
  ProfileMutationPayload,
  RegisterPayload,
  Role,
  RouteShape,
  User,
  UserMutationPayload,
  Vehicle,
} from '@/src/types/app';

type AccessAccount = {
  role: string;
  email: string;
  password: string;
};

type OfflineUser = User & {
  password: string;
};

type OfflineState = {
  users: OfflineUser[];
  routes: RouteShape[];
  vehicles: Vehicle[];
  incidents: Incident[];
  conversations: {
    id: string;
    title: string;
    participants: string[];
    unreadBy: Record<string, number>;
    messages: ChatMessage[];
  }[];
  documents: DocumentItem[];
  notifications: NotificationItem[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function minutesAgo(value: number) {
  return new Date(Date.now() - value * 60 * 1000).toISOString();
}

function daysFromNow(value: number) {
  return new Date(Date.now() + value * 24 * 60 * 60 * 1000).toISOString();
}

function buildState(): OfflineState {
  const users: OfflineUser[] = [
    {
      id: 'user-admin-01',
      name: 'Andrea Mercado',
      email: 'admin@combis.app',
      password: 'Ruta123!',
      role: 'admin',
      accountType: 'operations',
      phone: '+52 55 1000 2000',
      shift: 'Centro de control',
      status: 'online',
      avatar: 'AM',
      vehicleId: null,
    },
    {
      id: 'user-supervisor-01',
      name: 'Luis Tovar',
      email: 'supervisor@combis.app',
      password: 'Ruta123!',
      role: 'supervisor',
      accountType: 'operations',
      phone: '+52 55 3000 4000',
      shift: '06:00 - 14:00',
      status: 'patrolling',
      avatar: 'LT',
      vehicleId: null,
    },
    {
      id: 'user-driver-01',
      name: 'Marco Salinas',
      email: 'chofer@combis.app',
      password: 'Ruta123!',
      role: 'driver',
      accountType: 'operations',
      phone: '+52 55 5000 6000',
      shift: '05:30 - 13:30',
      status: 'on-route',
      avatar: 'MS',
      vehicleId: 'vehicle-101',
    },
    {
      id: 'user-driver-02',
      name: 'Diana Pineda',
      email: 'chofer2@combis.app',
      password: 'Ruta123!',
      role: 'driver',
      accountType: 'operations',
      phone: '+52 55 7000 8000',
      shift: '06:30 - 14:30',
      status: 'on-route',
      avatar: 'DP',
      vehicleId: 'vehicle-204',
    },
  ];

  const routes: RouteShape[] = [
    {
      id: 'route-1',
      name: 'Pantitlan - Tacuba',
      code: 'R-12',
      color: '#ff7b39',
      polyline: [
        { latitude: 19.415, longitude: -99.073 },
        { latitude: 19.423, longitude: -99.101 },
        { latitude: 19.4326, longitude: -99.1332 },
        { latitude: 19.4452, longitude: -99.1513 },
      ],
    },
    {
      id: 'route-2',
      name: 'La Raza - Indios Verdes',
      code: 'R-05',
      color: '#19c37d',
      polyline: [
        { latitude: 19.4671, longitude: -99.1368 },
        { latitude: 19.4773, longitude: -99.1312 },
        { latitude: 19.4924, longitude: -99.1276 },
        { latitude: 19.4978, longitude: -99.1269 },
      ],
    },
  ];

  const vehicles: Vehicle[] = [
    {
      id: 'vehicle-101',
      code: 'CB-101',
      plate: 'CMB-101-A',
      routeId: 'route-1',
      driverId: 'user-driver-01',
      supervisorId: 'user-supervisor-01',
      status: 'on-route',
      occupancy: 14,
      capacity: 18,
      etaMinutes: 6,
      delayMinutes: 2,
      speed: 36,
      fuel: 71,
      updatedAt: minutesAgo(2),
      location: {
        latitude: 19.4296,
        longitude: -99.1187,
      },
      routeName: 'Pantitlan - Tacuba',
      routeCode: 'R-12',
      routeColor: '#ff7b39',
      driverName: 'Marco Salinas',
    },
    {
      id: 'vehicle-204',
      code: 'CB-204',
      plate: 'CMB-204-B',
      routeId: 'route-2',
      driverId: 'user-driver-02',
      supervisorId: 'user-supervisor-01',
      status: 'on-route',
      occupancy: 9,
      capacity: 17,
      etaMinutes: 4,
      delayMinutes: 0,
      speed: 28,
      fuel: 55,
      updatedAt: minutesAgo(1),
      location: {
        latitude: 19.4847,
        longitude: -99.1309,
      },
      routeName: 'La Raza - Indios Verdes',
      routeCode: 'R-05',
      routeColor: '#19c37d',
      driverName: 'Diana Pineda',
    },
  ];

  const incidents: Incident[] = [
    {
      id: 'incident-1',
      title: 'Retraso por congestion en Circuito',
      type: 'traffic',
      severity: 'medium',
      status: 'open',
      routeId: 'route-1',
      vehicleId: 'vehicle-101',
      reporterId: 'user-driver-01',
      description: 'Tramo lento cerca de San Cosme. Impacto estimado de 8 minutos.',
      createdAt: minutesAgo(18),
      media: [],
    },
  ];

  const conversations = [
    {
      id: 'conversation-ops',
      title: 'Centro de control',
      participants: ['user-admin-01', 'user-supervisor-01', 'user-driver-01', 'user-driver-02'],
      unreadBy: {
        'user-admin-01': 0,
        'user-supervisor-01': 1,
        'user-driver-01': 0,
        'user-driver-02': 1,
      },
      messages: [
        {
          id: 'message-1',
          senderId: 'user-admin-01',
          text: 'Buen turno equipo. Prioridad hoy: puntualidad y reporte rapido.',
          createdAt: minutesAgo(60),
        },
        {
          id: 'message-2',
          senderId: 'user-driver-01',
          text: 'Unidad 101 en ruta y con aforo controlado.',
          createdAt: minutesAgo(18),
        },
        {
          id: 'message-3',
          senderId: 'user-driver-02',
          text: 'Unidad 204 sin novedad. Mantengo avance en ruta.',
          createdAt: minutesAgo(12),
        },
      ],
    },
  ];

  const documents: DocumentItem[] = [
    {
      id: 'document-1',
      ownerType: 'driver',
      ownerId: 'user-driver-01',
      name: 'Licencia tipo C',
      category: 'license',
      status: 'vigente',
      expiresAt: daysFromNow(28),
    },
    {
      id: 'document-2',
      ownerType: 'vehicle',
      ownerId: 'vehicle-101',
      name: 'Seguro de unidad CB-101',
      category: 'insurance',
      status: 'por_vencer',
      expiresAt: daysFromNow(12),
    },
    {
      id: 'document-3',
      ownerType: 'driver',
      ownerId: 'user-driver-02',
      name: 'Licencia tipo C - unidad 204',
      category: 'license',
      status: 'vigente',
      expiresAt: daysFromNow(34),
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'notification-1',
      title: 'Aforo alto en ruta R-12',
      body: 'CB-101 supero el 75% de ocupacion.',
      level: 'warning',
      createdAt: minutesAgo(10),
      readBy: [],
    },
    {
      id: 'notification-2',
      title: 'Punto de control proximo',
      body: 'La unidad CB-204 debe reportar estatus en el siguiente checkpoint.',
      level: 'info',
      createdAt: minutesAgo(6),
      readBy: [],
    },
  ];

  return {
    users,
    routes,
    vehicles,
    incidents,
    conversations,
    documents,
    notifications,
  };
}

let offlineState = buildState();

function stripUser(user: OfflineUser): User {
  const safeUser = { ...user } as Partial<OfflineUser>;
  delete safeUser.password;
  return safeUser as User;
}

function findUserByToken(token: string) {
  const email = token.replace('local-token:', '');
  return offlineState.users.find((entry) => entry.email === email) || null;
}

function getVehicle(vehicleId: string | null) {
  return offlineState.vehicles.find((vehicle) => vehicle.id === vehicleId) || null;
}

function buildAvatar(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || '')
    .join('');
}

function normalizeRole(role?: Role) {
  return role && ['owner', 'admin', 'dispatcher', 'supervisor', 'billing_manager', 'support', 'viewer', 'driver'].includes(role)
    ? role
    : 'driver';
}

function normalizeAccountType(accountType?: AccountType) {
  return accountType === 'company_owner' ? 'company_owner' : 'operations';
}

function normalizePaymentMethod(method?: PaymentProfile['preferredMethod']) {
  return method && ['card', 'spei', 'transfer'].includes(method) ? method : 'card';
}

function ensureUniqueEmail(email: string, ignoreUserId?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const exists = offlineState.users.some(
    (entry) => entry.email.toLowerCase() === normalizedEmail && entry.id !== ignoreUserId
  );

  if (exists) {
    throw new Error('El correo ya existe.');
  }

  return normalizedEmail;
}

function syncVehicles() {
  offlineState.vehicles = offlineState.vehicles.map((vehicle) => {
    const driver = offlineState.users.find((entry) => entry.id === vehicle.driverId);

    return {
      ...vehicle,
      driverName: driver?.name || 'Pendiente asignacion',
    };
  });
}

function listUsers() {
  const roleOrder: Partial<Record<Role, number>> = {
    owner: 0,
    admin: 0,
    dispatcher: 1,
    supervisor: 2,
    billing_manager: 3,
    support: 4,
    viewer: 5,
    driver: 6,
  };

  return clone(
    offlineState.users
      .map((entry) => stripUser(entry))
      .sort((left, right) => {
        const leftOrder = roleOrder[left.role] ?? 99;
        const rightOrder = roleOrder[right.role] ?? 99;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.name.localeCompare(right.name, 'es-MX');
      })
  );
}

function requireAdminUser(token: string) {
  const user = findUserByToken(token);

  if (!user || user.role !== 'admin') {
    throw new Error('Solo el administrador puede gestionar usuarios.');
  }

  return user;
}

function createOfflineUser(payload: UserMutationPayload, forcedRole?: Role) {
  const name = String(payload.name || '').trim();
  const password = String(payload.password || '').trim();

  if (!name || !payload.email || !password) {
    throw new Error('Nombre, correo y contraseña son obligatorios.');
  }

  const role = forcedRole || normalizeRole(payload.role);
  const email = ensureUniqueEmail(payload.email);
  const user: OfflineUser = {
    id: `user-${Date.now()}`,
    name,
    email,
    password,
    role,
    accountType: normalizeAccountType(payload.accountType),
    phone: String(payload.phone || '').trim() || 'Pendiente',
    shift:
      String(payload.shift || '').trim() ||
      (role === 'admin' ? 'Centro de control' : 'Pendiente asignacion'),
    status: String(payload.status || '').trim() || (role === 'driver' ? 'offline' : 'online'),
    avatar: buildAvatar(name),
    avatarUrl: payload.avatarUrl || null,
    vehicleId: role === 'driver' ? payload.vehicleId || null : null,
    companyProfile: {
      companyName: String(payload.companyName || '').trim(),
      legalName: String(payload.legalName || payload.companyName || '').trim(),
      taxId: String(payload.taxId || '').trim(),
      billingEmail: String(payload.billingEmail || email).trim(),
      billingAddress: String(payload.billingAddress || '').trim(),
    },
    paymentProfile: {
      preferredMethod: normalizePaymentMethod(payload.preferredMethod),
      cardholderName: String(payload.cardholderName || '').trim(),
      cardBrand: String(payload.cardBrand || '').trim(),
      cardLast4: String(payload.cardLast4 || '').replace(/[^\d]/g, '').slice(-4),
      cardExpMonth: String(payload.cardExpMonth || '').replace(/[^\d]/g, '').slice(0, 2),
      cardExpYear: String(payload.cardExpYear || '').replace(/[^\d]/g, '').slice(-2),
      customerReference: String(payload.customerReference || payload.companyName || '').trim(),
    },
  };

  offlineState.users.unshift(user);
  syncVehicles();

  return stripUser(user);
}

function buildNotifications(user: User) {
  const allowedLevels =
    user.role === 'driver' ? ['warning', 'info'] : ['warning', 'critical', 'info'];

  return clone(
    offlineState.notifications
      .filter((notification) => allowedLevels.includes(notification.level))
      .map((notification) => ({
        ...notification,
        isRead: notification.readBy.includes(user.id),
      }))
  );
}

function buildDocuments(user: User) {
  return clone(
    offlineState.documents.filter((document) => {
      if (user.role !== 'driver') {
        return true;
      }

      if (document.ownerType === 'driver') {
        return document.ownerId === user.id;
      }

      return document.ownerId === user.vehicleId;
    })
  );
}

export const ACCESS_ACCOUNTS: AccessAccount[] = [
  {
    role: 'Administrador',
    email: 'admin@combis.app',
    password: 'Ruta123!',
  },
  {
    role: 'Supervisor',
    email: 'supervisor@combis.app',
    password: 'Ruta123!',
  },
  {
    role: 'Chofer',
    email: 'chofer@combis.app',
    password: 'Ruta123!',
  },
  {
    role: 'Chofer',
    email: 'chofer2@combis.app',
    password: 'Ruta123!',
  },
];

export function offlineLogin(email: string, password: string) {
  const user = offlineState.users.find(
    (entry) => entry.email.toLowerCase() === email.trim().toLowerCase() && entry.password === password
  );

  if (!user) {
    throw new Error('No fue posible iniciar en modo local con esas credenciales.');
  }

  return {
    mode: 'local' as const,
    token: `local-token:${user.email}`,
    user: stripUser(user),
  };
}

export function offlineRegister(payload: RegisterPayload) {
  const user = createOfflineUser(payload, 'driver');

  return {
    mode: 'local' as const,
    token: `local-token:${user.email}`,
    user,
  };
}

export function offlineGetSession(token: string) {
  const user = findUserByToken(token);

  if (!user) {
    throw new Error('Sesión local inválida');
  }

  return {
    profile: {
      user: stripUser(user),
      vehicle: user.vehicleId ? getVehicle(user.vehicleId) : null,
      documents: buildDocuments(stripUser(user)),
    },
  };
}

export function offlineGetLocations() {
  return clone({
    updatedAt: new Date().toISOString(),
    center: {
      latitude: 19.4326,
      longitude: -99.1332,
    },
    routes: offlineState.routes,
    vehicles: offlineState.vehicles,
    incidents: offlineState.incidents,
  }) as LiveLocationsData;
}

export function offlineGetIncidents(token: string) {
  const user = findUserByToken(token);

  if (!user) {
    return [];
  }

  return clone(
    offlineState.incidents.filter((incident) => {
      return user.role === 'driver' ? incident.vehicleId === user.vehicleId : true;
    })
  );
}

export function offlineCreateIncident(token: string, draft: IncidentDraft) {
  const user = findUserByToken(token);

  if (!user) {
    throw new Error('Sesión local inválida');
  }

  const incident: Incident = {
    id: `incident-${Date.now()}`,
    title: draft.title,
    type: draft.type,
    severity: draft.severity,
    status: 'open',
    routeId: draft.routeId || (user.vehicleId ? getVehicle(user.vehicleId)?.routeId || null : null),
    vehicleId: user.vehicleId,
    reporterId: user.id,
    description: draft.description,
    location: draft.location || null,
    createdAt: new Date().toISOString(),
    media: [],
  };

  offlineState.incidents.unshift(incident);
  offlineState.notifications.unshift({
    id: `notification-${Date.now()}`,
    title: `Nueva incidencia: ${incident.title}`,
    body: `${user.name} envio un reporte desde la app.`,
    level: 'warning',
    createdAt: new Date().toISOString(),
    readBy: [],
  });

  return clone(incident);
}

export function offlineUpdateIncidentStatus(incidentId: string, status: IncidentStatus) {
  const incident = offlineState.incidents.find((entry) => entry.id === incidentId);

  if (!incident) {
    throw new Error('Incidencia no encontrada');
  }

  incident.status = status;
  return clone(incident);
}

export function offlineGetConversations(token: string) {
  const user = findUserByToken(token);

  if (!user) {
    return [];
  }

  return clone(
    offlineState.conversations
      .filter((conversation) => conversation.participants.includes(user.id))
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        participants: conversation.participants
          .map((participantId) => offlineState.users.find((entry) => entry.id === participantId))
          .filter(Boolean)
          .map((entry) => stripUser(entry as OfflineUser)),
        unreadCount: conversation.unreadBy[user.id] || 0,
        lastMessage: conversation.messages[conversation.messages.length - 1],
      }))
  ) as ConversationSummary[];
}

export function offlineGetMessages(token: string, conversationId: string) {
  const user = findUserByToken(token);
  const conversation = offlineState.conversations.find((entry) => entry.id === conversationId);

  if (!user || !conversation || !conversation.participants.includes(user.id)) {
    return [];
  }

  conversation.unreadBy[user.id] = 0;

  return clone(
    conversation.messages.map((message) => ({
      ...message,
      sender: stripUser(
        offlineState.users.find((entry) => entry.id === message.senderId) as OfflineUser
      ),
    }))
  ) as ChatMessage[];
}

export function offlineSendMessage(token: string, conversationId: string, text: string) {
  const user = findUserByToken(token);
  const conversation = offlineState.conversations.find((entry) => entry.id === conversationId);

  if (!user || !conversation) {
    throw new Error('Conversacion local no disponible');
  }

  const message: ChatMessage = {
    id: `message-${Date.now()}`,
    senderId: user.id,
    text,
    createdAt: new Date().toISOString(),
    sender: stripUser(user),
    conversationId,
  };

  conversation.messages.push(message);
  conversation.participants
    .filter((participantId) => participantId !== user.id)
    .forEach((participantId) => {
      conversation.unreadBy[participantId] = (conversation.unreadBy[participantId] || 0) + 1;
    });

  return clone(message);
}

export function offlineGetDocuments(token: string) {
  const user = findUserByToken(token);

  if (!user) {
    return [];
  }

  return buildDocuments(stripUser(user));
}

export function offlineGetNotifications(token: string) {
  const user = findUserByToken(token);

  if (!user) {
    return [];
  }

  return buildNotifications(stripUser(user));
}

export function offlineMarkNotificationRead(token: string, notificationId: string) {
  const user = findUserByToken(token);
  const notification = offlineState.notifications.find((entry) => entry.id === notificationId);

  if (!user || !notification) {
    throw new Error('Notificacion local no encontrada');
  }

  if (!notification.readBy.includes(user.id)) {
    notification.readBy.push(user.id);
  }

  return clone(notification);
}

export function offlineListUsers(token: string) {
  requireAdminUser(token);
  return listUsers();
}

export function offlineCreateUser(token: string, payload: UserMutationPayload) {
  requireAdminUser(token);
  return createOfflineUser(payload);
}

export function offlineUpdateUser(token: string, userId: string, payload: UserMutationPayload) {
  requireAdminUser(token);
  const user = offlineState.users.find((entry) => entry.id === userId);

  if (!user) {
    throw new Error('Usuario no encontrado.');
  }

  if (payload.email) {
    user.email = ensureUniqueEmail(payload.email, user.id);
  }

  if (payload.name) {
    user.name = String(payload.name).trim();
    user.avatar = buildAvatar(user.name);
  }

  if (typeof payload.avatarUrl !== 'undefined') {
    user.avatarUrl = payload.avatarUrl || null;
  }

  if (typeof payload.phone === 'string') {
    user.phone = payload.phone.trim() || 'Pendiente';
  }

  if (typeof payload.shift === 'string') {
    user.shift = payload.shift.trim() || 'Pendiente asignacion';
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'operationalSchedule')) {
    user.operationalSchedule = payload.operationalSchedule
      ? {
          activeDays: Array.isArray(payload.operationalSchedule.activeDays)
            ? payload.operationalSchedule.activeDays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            : [1, 2, 3, 4, 5, 6, 0],
          enabled: payload.operationalSchedule.enabled !== false,
          endTime: String(payload.operationalSchedule.endTime || '').trim(),
          startTime: String(payload.operationalSchedule.startTime || '').trim(),
          timezone: payload.operationalSchedule.timezone || null,
        }
      : null;
  }

  const nextRole = payload.role ? normalizeRole(payload.role) : user.role;
  user.role = nextRole;
  user.accountType = normalizeAccountType(payload.accountType || user.accountType);
  user.status = String(payload.status || '').trim() || user.status;

  if (typeof payload.vehicleId !== 'undefined') {
    user.vehicleId = nextRole === 'driver' ? payload.vehicleId || null : null;
  } else if (nextRole !== 'driver') {
    user.vehicleId = null;
  }

  if (payload.password && String(payload.password).trim()) {
    user.password = String(payload.password).trim();
  }

  syncVehicles();

  return stripUser(user);
}

export function offlineUpdateProfile(token: string, payload: ProfileMutationPayload) {
  const user = findUserByToken(token);

  if (!user) {
    throw new Error('Sesión local inválida.');
  }

  if (payload.email) {
    user.email = ensureUniqueEmail(payload.email, user.id);
  }

  if (payload.name) {
    user.name = String(payload.name).trim();
    user.avatar = buildAvatar(user.name);
  }

  if (typeof payload.phone === 'string') {
    user.phone = payload.phone.trim() || 'Pendiente';
  }

  if (typeof payload.avatarUrl !== 'undefined') {
    user.avatarUrl = payload.avatarUrl || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'operationalSchedule')) {
    user.operationalSchedule = payload.operationalSchedule
      ? {
          activeDays: Array.isArray(payload.operationalSchedule.activeDays)
            ? payload.operationalSchedule.activeDays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            : [1, 2, 3, 4, 5, 6, 0],
          enabled: payload.operationalSchedule.enabled !== false,
          endTime: String(payload.operationalSchedule.endTime || '').trim(),
          startTime: String(payload.operationalSchedule.startTime || '').trim(),
          timezone: payload.operationalSchedule.timezone || null,
        }
      : null;
  }

  if (payload.accountType) {
    user.accountType = normalizeAccountType(payload.accountType);
  }

  if (payload.password && String(payload.password).trim()) {
    user.password = String(payload.password).trim();
  }

  syncVehicles();

  return stripUser(user);
}

export function offlineDeleteUser(token: string, userId: string) {
  const actor = requireAdminUser(token);

  if (actor.id === userId) {
    throw new Error('No puedes eliminar tu propia cuenta.');
  }

  const exists = offlineState.users.some((entry) => entry.id === userId);

  if (!exists) {
    throw new Error('Usuario no encontrado.');
  }

  offlineState.users = offlineState.users.filter((entry) => entry.id !== userId);
  offlineState.vehicles = offlineState.vehicles.map((vehicle) => ({
    ...vehicle,
    driverId: vehicle.driverId === userId ? null : vehicle.driverId,
    supervisorId: vehicle.supervisorId === userId ? null : vehicle.supervisorId,
  }));
  offlineState.conversations = offlineState.conversations
    .map((conversation) => {
      const participants = conversation.participants.filter((participantId) => participantId !== userId);
      const unreadBy = { ...conversation.unreadBy };
      delete unreadBy[userId];

      return {
        ...conversation,
        participants,
        unreadBy,
      };
    })
    .filter((conversation) => conversation.participants.length > 0);
  offlineState.documents = offlineState.documents.filter(
    (document) => !(document.ownerType === 'driver' && document.ownerId === userId)
  );
  offlineState.notifications = offlineState.notifications.map((notification) => ({
    ...notification,
    readBy: notification.readBy.filter((entry) => entry !== userId),
  }));
  syncVehicles();
}
