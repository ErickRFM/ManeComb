const bcrypt = require("bcryptjs");
const { toServiceDate } = require("../utils/service-date");

function minutesAgo(value) {
  return new Date(Date.now() - value * 60 * 1000).toISOString();
}

function hoursAgo(value) {
  return new Date(Date.now() - value * 60 * 60 * 1000).toISOString();
}

function daysFromNow(value) {
  return new Date(Date.now() + value * 24 * 60 * 60 * 1000).toISOString();
}

function daysAgo(value) {
  return new Date(Date.now() - value * 24 * 60 * 60 * 1000).toISOString();
}

function createSeedState() {
  const seedPassword = bcrypt.hashSync("Ruta123!", 10);
  const demoOrganizationId = "manecomb-demo";

  const users = [
    {
      id: "user-admin-01",
      name: "Andrea Mercado",
      email: "admin@combis.app",
      passwordHash: seedPassword,
      role: "admin",
      accountType: "operations",
      organizationId: demoOrganizationId,
      userStatus: "active",
      phone: "+52 55 1000 2000",
      shift: "Centro de control",
      status: "online",
      avatar: "AM",
      vehicleId: null
    },
    {
      id: "user-supervisor-01",
      name: "Luis Tovar",
      email: "supervisor@combis.app",
      passwordHash: seedPassword,
      role: "supervisor",
      accountType: "operations",
      organizationId: demoOrganizationId,
      userStatus: "active",
      phone: "+52 55 3000 4000",
      shift: "06:00 - 14:00",
      status: "patrolling",
      avatar: "LT",
      vehicleId: null
    },
    {
      id: "user-driver-01",
      name: "Marco Salinas",
      email: "chofer@combis.app",
      passwordHash: seedPassword,
      role: "driver",
      accountType: "operations",
      organizationId: demoOrganizationId,
      userStatus: "active",
      phone: "+52 55 5000 6000",
      shift: "05:30 - 13:30",
      status: "on-route",
      avatar: "MS",
      vehicleId: "vehicle-101"
    },
    {
      id: "user-driver-02",
      name: "Diana Pineda",
      email: "chofer2@combis.app",
      passwordHash: seedPassword,
      role: "driver",
      accountType: "operations",
      organizationId: demoOrganizationId,
      userStatus: "active",
      phone: "+52 55 7000 8000",
      shift: "06:30 - 14:30",
      status: "on-route",
      avatar: "DP",
      vehicleId: "vehicle-204"
    }
  ];

  const routes = [];

  const vehicles = [
    {
      id: "vehicle-101",
      organizationId: demoOrganizationId,
      code: "CB-101",
      plate: "CMB-101-A",
      routeId: null,
      driverId: "user-driver-01",
      supervisorId: "user-supervisor-01",
      status: "on-route",
      occupancy: 14,
      capacity: 18,
      etaMinutes: 6,
      delayMinutes: 2,
      speed: 10, // 36 km/h en m/s
      fuel: 71,
      updatedAt: minutesAgo(2),
      location: {
        latitude: 19.4296,
        longitude: -99.1187
      }
    },
    {
      id: "vehicle-204",
      organizationId: demoOrganizationId,
      code: "CB-204",
      plate: "CMB-204-B",
      routeId: null,
      driverId: "user-driver-02",
      supervisorId: "user-supervisor-01",
      status: "on-route",
      occupancy: 9,
      capacity: 17,
      etaMinutes: 4,
      delayMinutes: 0,
      speed: 7.8, // 28 km/h en m/s
      fuel: 55,
      updatedAt: minutesAgo(1),
      location: {
        latitude: 19.4847,
        longitude: -99.1309
      }
    },
    {
      id: "vehicle-310",
      organizationId: demoOrganizationId,
      code: "CB-310",
      plate: "CMB-310-C",
      routeId: null,
      driverId: null,
      supervisorId: "user-supervisor-01",
      status: "maintenance",
      occupancy: 0,
      capacity: 18,
      etaMinutes: null,
      delayMinutes: 0,
      speed: 0,
      fuel: 33,
      updatedAt: minutesAgo(9),
      location: {
        latitude: 19.3724,
        longitude: -99.2599
      }
    }
  ];

  const incidents = [
    {
      id: "incident-1",
      organizationId: demoOrganizationId,
      title: "Retraso por congestion en Circuito",
      type: "traffic",
      severity: "medium",
      status: "open",
      routeId: null,
      vehicleId: "vehicle-101",
      reporterId: "user-driver-01",
      description: "Tramo lento cerca de San Cosme. Se calcula impacto de 8 minutos.",
      createdAt: minutesAgo(18),
      media: []
    },
    {
      id: "incident-2",
      organizationId: demoOrganizationId,
      title: "Revision preventiva de frenos",
      type: "maintenance",
      severity: "high",
      status: "in_progress",
      routeId: null,
      vehicleId: "vehicle-310",
      reporterId: "user-supervisor-01",
      description: "Unidad retirada de operacion hasta cerrar checklist mecanico.",
      createdAt: hoursAgo(2),
      media: []
    }
  ];

  const conversations = [
    {
      id: "conversation-ops",
      organizationId: demoOrganizationId,
      title: "Centro de control",
      participants: [
        "user-admin-01",
        "user-supervisor-01",
        "user-driver-01",
        "user-driver-02"
      ],
      unreadBy: {
        "user-admin-01": 0,
        "user-supervisor-01": 1,
        "user-driver-01": 0,
        "user-driver-02": 2
      },
      messages: [
        {
          id: "message-1",
          senderId: "user-admin-01",
          text: "Buen turno equipo. Prioridad hoy: puntualidad y reporte de incidencias.",
          createdAt: hoursAgo(3)
        },
        {
          id: "message-2",
          senderId: "user-driver-01",
          text: "Recibido. Unidad 101 ya en ruta con aforo estable.",
          createdAt: minutesAgo(40)
        },
        {
          id: "message-3",
          senderId: "user-supervisor-01",
          text: "Revisen el tramo de La Raza, se reporta carga alta en 20 minutos.",
          createdAt: minutesAgo(14)
        }
      ]
    },
    {
      id: "conversation-101",
      organizationId: demoOrganizationId,
      title: "Soporte unidad CB-101",
      participants: ["user-admin-01", "user-driver-01"],
      unreadBy: {
        "user-admin-01": 1,
        "user-driver-01": 0
      },
      messages: [
        {
          id: "message-4",
          senderId: "user-admin-01",
          text: "Marco, confirma si necesitas apoyo por el retraso.",
          createdAt: minutesAgo(22)
        },
        {
          id: "message-5",
          senderId: "user-driver-01",
          text: "Solo congestion. Mantengo avance y actualizo si escala.",
          createdAt: minutesAgo(20)
        }
      ]
    }
  ];

  const documents = [
    {
      id: "document-1",
      organizationId: demoOrganizationId,
      ownerType: "driver",
      ownerId: "user-driver-01",
      name: "Licencia tipo C",
      category: "license",
      status: "vigente",
      expiresAt: daysFromNow(28),
      fileUrl: null,
      storageType: "seed",
      mimeType: "application/pdf",
      fileSize: 184320,
      uploadedAt: daysAgo(12),
      uploadedBy: "user-driver-01",
      originalFileName: "licencia-marco-salinas.pdf",
      storageKey: "",
      reviewStatus: "approved",
      reviewedAt: daysAgo(10),
      reviewedBy: "user-admin-01",
      reviewNotes: "Documento validado"
    },
    {
      id: "document-2",
      organizationId: demoOrganizationId,
      ownerType: "vehicle",
      ownerId: "vehicle-101",
      name: "Seguro de unidad CB-101",
      category: "insurance",
      status: "por_vencer",
      expiresAt: daysFromNow(12),
      fileUrl: null,
      storageType: "seed",
      mimeType: "application/pdf",
      fileSize: 241610,
      uploadedAt: daysAgo(21),
      uploadedBy: "user-admin-01",
      originalFileName: "seguro-cb-101.pdf",
      storageKey: "",
      reviewStatus: "pending_review",
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: ""
    },
    {
      id: "document-3",
      organizationId: demoOrganizationId,
      ownerType: "vehicle",
      ownerId: "vehicle-310",
      name: "Verificacion semestral",
      category: "inspection",
      status: "vencido",
      expiresAt: daysFromNow(-2),
      fileUrl: null,
      storageType: "seed",
      mimeType: "application/pdf",
      fileSize: 215040,
      uploadedAt: daysAgo(188),
      uploadedBy: "user-supervisor-01",
      originalFileName: "verificacion-cb-310.pdf",
      storageKey: "",
      reviewStatus: "rejected",
      reviewedAt: daysAgo(1),
      reviewedBy: "user-admin-01",
      reviewNotes: "La verificacion ya esta vencida"
    }
  ];

  const notifications = [
    {
      id: "notification-1",
      organizationId: demoOrganizationId,
      title: "Aforo alto en ruta R-12",
      body: "CB-101 supero el 75% de ocupacion.",
      level: "warning",
      targetRoles: ["admin", "supervisor"],
      createdAt: minutesAgo(10),
      readBy: ["user-admin-01"]
    },
    {
      id: "notification-2",
      organizationId: demoOrganizationId,
      title: "Checklist pendiente en CB-310",
      body: "Mantenimiento solicita validacion de supervisor.",
      level: "critical",
      targetRoles: ["admin", "supervisor"],
      createdAt: minutesAgo(32),
      readBy: []
    },
    {
      id: "notification-3",
      organizationId: demoOrganizationId,
      title: "Recuerda actualizar ubicacion",
      body: "La app no ha enviado posicion en los ultimos 2 minutos.",
      level: "info",
      targetRoles: ["driver"],
      createdAt: minutesAgo(5),
      readBy: []
    }
  ];

  const tripLogs = [
    {
      id: "trip-101-today-1",
      organizationId: demoOrganizationId,
      vehicleId: "vehicle-101",
      vehicleCode: "CB-101",
      lap: 1,
      serviceDate: toServiceDate(hoursAgo(6)),
      originLabel: "Pantitlan",
      destinationLabel: "Tacuba",
      origin: {
        latitude: 19.415,
        longitude: -99.073
      },
      destination: {
        latitude: 19.4452,
        longitude: -99.1513
      },
      startedAt: hoursAgo(6),
      finishedAt: hoursAgo(5.55),
      durationSeconds: 1620,
      distanceMeters: 12300,
      plannedDurationSeconds: 1500,
      provider: "system",
      registeredBy: "user-admin-01"
    },
    {
      id: "trip-101-today-2",
      organizationId: demoOrganizationId,
      vehicleId: "vehicle-101",
      vehicleCode: "CB-101",
      lap: 2,
      serviceDate: toServiceDate(hoursAgo(4.5)),
      originLabel: "Pantitlan",
      destinationLabel: "Tacuba",
      origin: {
        latitude: 19.415,
        longitude: -99.073
      },
      destination: {
        latitude: 19.4452,
        longitude: -99.1513
      },
      startedAt: hoursAgo(4.5),
      finishedAt: hoursAgo(4.03),
      durationSeconds: 1680,
      distanceMeters: 12300,
      plannedDurationSeconds: 1540,
      provider: "system",
      registeredBy: "user-admin-01"
    },
    {
      id: "trip-204-yesterday-1",
      organizationId: demoOrganizationId,
      vehicleId: "vehicle-204",
      vehicleCode: "CB-204",
      lap: 1,
      serviceDate: toServiceDate(daysAgo(1)),
      originLabel: "La Raza",
      destinationLabel: "Indios Verdes",
      origin: {
        latitude: 19.4671,
        longitude: -99.1368
      },
      destination: {
        latitude: 19.4978,
        longitude: -99.1269
      },
      startedAt: daysAgo(1),
      finishedAt: new Date(Date.now() - (24 * 60 + 34) * 60 * 1000).toISOString(),
      durationSeconds: 1560,
      distanceMeters: 9800,
      plannedDurationSeconds: 1480,
      provider: "system",
      registeredBy: "user-supervisor-01"
    }
  ];

  return {
    users,
    routes,
    vehicles,
    incidents,
    conversations,
    documents,
    notifications,
    tripLogs,
    commercialOrders: [
      {
        id: "commercial-demo-active",
        referenceCode: "MNCB-DEMO-ACTIVE",
        organizationId: demoOrganizationId,
        organizationSlug: demoOrganizationId,
        companyName: "ManeComb Demo",
        contactName: "Andrea Mercado",
        email: "admin@combis.app",
        phone: "+52 55 1000 2000",
        planId: "growth-10",
        planName: "Crecimiento",
        fleetSize: 10,
        basePlanPrice: 4990,
        totalPrice: 4990,
        pricePerVehicle: 499,
        strategy: "demo",
        paymentMethod: "transfer",
        paymentStatus: "paid",
        activationStatus: "active",
        status: "active",
        starterFleet: [],
        createdAt: daysAgo(30),
        paymentApprovedAt: daysAgo(30),
        activatedAt: daysAgo(30)
      }
    ],
    rtcSessions: [],
    // La publicacion movil es una autoridad durable y explicita de Platform.
    // Los fixtures no deben anunciar APK, version o URL historicos.
    appConfig: null,
  };
}

module.exports = {
  createSeedState
};
