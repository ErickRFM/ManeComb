import { readFileSync, writeFileSync } from 'node:fs';

function patchFile(filePath, replacements) {
  let source = readFileSync(filePath, 'utf8');
  for (const [label, before, after] of replacements) {
    const first = source.indexOf(before);
    if (first < 0) throw new Error(`${filePath} ${label}: source snippet not found`);
    if (source.indexOf(before, first + before.length) >= 0) {
      throw new Error(`${filePath} ${label}: source snippet appears more than once`);
    }
    source = source.slice(0, first) + after + source.slice(first + before.length);
  }
  writeFileSync(filePath, source);
}

patchFile('mobile/src/screens/map/components/BottomTrackingPanel.tsx', [
  [
    'remove role type dependency',
    "import type { Incident, RouteSession, User, Vehicle } from '@/src/types/app';",
    "import type { Incident, RouteSession, Vehicle } from '@/src/types/app';"
  ],
  [
    'capability presentation prop',
    "  userRole: User['role'];",
    "  canViewVehicleDetails: boolean;"
  ],
  [
    'capability prop destructure',
    "  userRole,\n  activeSession,",
    "  canViewVehicleDetails,\n  activeSession,"
  ],
  [
    'remove local role gate',
    "  const canViewVehicleDetails = userRole === 'admin' || userRole === 'supervisor';\n",
    ""
  ]
]);

patchFile('mobile/src/screens/map-screen.native.tsx', [
  [
    'capability imports',
    "import { useAppStore } from '@/src/store/use-app-store';",
    "import { useAppStore } from '@/src/store/use-app-store';\nimport {\n  ENTERPRISE_CAPABILITY,\n  hasEnterpriseCapability,\n} from '@/src/store/mobile-capability-authority';"
  ],
  [
    'scoped inventory comment and detail capability',
    "  const visibleMapUnits = driverWithoutUnit ? [] : mappableUnits;\n  // Sin distincion por rol: el conductor ve el mismo inventario que el resto.\n  const visiblePanelUnits = driverWithoutUnit ? [] : prioritizedUnits;\n  const visibleMapIncidents = driverWithoutUnit ? [] : visibleIncidents;",
    "  const visibleMapUnits = driverWithoutUnit ? [] : mappableUnits;\n  // El backend ya entrega inventario tenant/driver-scoped; Mobile no vuelve a inferir alcance por rol.\n  const visiblePanelUnits = driverWithoutUnit ? [] : prioritizedUnits;\n  const visibleMapIncidents = driverWithoutUnit ? [] : visibleIncidents;\n  const canViewVehicleDetails = hasEnterpriseCapability(\n    user,\n    ENTERPRISE_CAPABILITY.analyticsView\n  );"
  ],
  [
    'panel capability prop',
    "              trackingUnits={visiblePanelUnits}\n              userRole={user.role}\n              activeSession={activeRouteSession}",
    "              trackingUnits={visiblePanelUnits}\n              canViewVehicleDetails={canViewVehicleDetails}\n              activeSession={activeRouteSession}"
  ]
]);

console.log('ok - map vehicle detail capability codemod applied exactly');
