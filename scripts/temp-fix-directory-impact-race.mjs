import fs from 'node:fs';

const file = 'mobile/src/screens/users-screen.tsx';
let source = fs.readFileSync(file, 'utf8');

function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing exact block: ${label}`);
  source = source.replace(from, to);
}

replaceExact(
  "import { useCallback, useEffect, useMemo, useState } from 'react';",
  "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';",
  'react useRef import'
);

replaceExact(
  "  const [driverConfirmation, setDriverConfirmation] = useState('');\n\n  const [vehicleEditor, setVehicleEditor]",
  "  const [driverConfirmation, setDriverConfirmation] = useState('');\n  const driverImpactRequestId = useRef(0);\n\n  const [vehicleEditor, setVehicleEditor]",
  'driver impact request ref'
);

replaceExact(
  "  const [vehicleReason, setVehicleReason] = useState('');\n\n  const [assignmentVehicle",
  "  const [vehicleReason, setVehicleReason] = useState('');\n  const vehicleImpactRequestId = useRef(0);\n\n  const [assignmentVehicle",
  'vehicle impact request ref'
);

replaceExact(
`  const loadDriverImpact = async (target: User) => {
    setDriverImpact(null);
    setDriverImpactError(null);
    setDriverImpactLoading(true);
    try {
      setDriverImpact(await getDriverLifecycleImpactRequest(target.id));
    } catch (error) {
      setDriverImpactError(getApiErrorMessage(error, 'No fue posible revisar el impacto de la acción.'));
    } finally {
      setDriverImpactLoading(false);
    }
  };`,
`  const loadDriverImpact = async (target: User) => {
    const requestId = ++driverImpactRequestId.current;
    setDriverImpact(null);
    setDriverImpactError(null);
    setDriverImpactLoading(true);
    try {
      const impact = await getDriverLifecycleImpactRequest(target.id);
      if (requestId !== driverImpactRequestId.current) return;
      setDriverImpact(impact);
    } catch (error) {
      if (requestId !== driverImpactRequestId.current) return;
      setDriverImpactError(getApiErrorMessage(error, 'No fue posible revisar el impacto de la acción.'));
    } finally {
      if (requestId === driverImpactRequestId.current) setDriverImpactLoading(false);
    }
  };`,
  'driver impact loader'
);

replaceExact(
`  const closeDriverAction = () => {
    if (driverActionSubmitting) return;
    setDriverAction(null);`,
`  const closeDriverAction = () => {
    if (driverActionSubmitting) return;
    driverImpactRequestId.current += 1;
    setDriverAction(null);`,
  'driver close invalidation'
);

replaceExact(
`  const loadVehicleImpact = async (target: ManagedVehicle) => {
    setVehicleImpact(null);
    setVehicleImpactError(null);
    setVehicleImpactLoading(true);
    try {
      setVehicleImpact(await getVehicleDeletionImpactRequest(target.id));
    } catch (error) {
      setVehicleImpactError(getApiErrorMessage(error, 'No fue posible revisar las dependencias de la unidad.'));
    } finally {
      setVehicleImpactLoading(false);
    }
  };`,
`  const loadVehicleImpact = async (target: ManagedVehicle) => {
    const requestId = ++vehicleImpactRequestId.current;
    setVehicleImpact(null);
    setVehicleImpactError(null);
    setVehicleImpactLoading(true);
    try {
      const impact = await getVehicleDeletionImpactRequest(target.id);
      if (requestId !== vehicleImpactRequestId.current) return;
      setVehicleImpact(impact);
    } catch (error) {
      if (requestId !== vehicleImpactRequestId.current) return;
      setVehicleImpactError(getApiErrorMessage(error, 'No fue posible revisar las dependencias de la unidad.'));
    } finally {
      if (requestId === vehicleImpactRequestId.current) setVehicleImpactLoading(false);
    }
  };`,
  'vehicle impact loader'
);

replaceExact(
`  const closeVehicleAction = () => {
    if (vehicleActionSubmitting) return;
    setVehicleAction(null);`,
`  const closeVehicleAction = () => {
    if (vehicleActionSubmitting) return;
    vehicleImpactRequestId.current += 1;
    setVehicleAction(null);`,
  'vehicle close invalidation'
);

replaceExact(
`  useEffect(() => {
    if (user) void refreshDirectory();
  }, [refreshDirectory, user]);`,
`  useEffect(() => {
    if (user) void refreshDirectory();
  }, [refreshDirectory, user]);

  useEffect(() => () => {
    driverImpactRequestId.current += 1;
    vehicleImpactRequestId.current += 1;
  }, []);`,
  'unmount invalidation'
);

fs.writeFileSync(file, source);

const testFile = 'mobile/src/screens/users/directory-impact-race.test.ts';
fs.writeFileSync(testFile, `const fs = require('fs');\nconst path = require('path');\nconst nodeProcess = require('process');\n\nexport {};\n\nconst source = fs.readFileSync(path.join(nodeProcess.cwd(), 'src', 'screens', 'users-screen.tsx'), 'utf8');\n\ndescribe('Directory impact request authority', () => {\n  test('driver impact ignores out-of-order responses and invalidates on close', () => {\n    expect(source).toContain('const requestId = ++driverImpactRequestId.current;');\n    expect(source).toContain('if (requestId !== driverImpactRequestId.current) return;');\n    expect(source).toContain('driverImpactRequestId.current += 1;');\n  });\n\n  test('vehicle impact ignores out-of-order responses and invalidates on close', () => {\n    expect(source).toContain('const requestId = ++vehicleImpactRequestId.current;');\n    expect(source).toContain('if (requestId !== vehicleImpactRequestId.current) return;');\n    expect(source).toContain('vehicleImpactRequestId.current += 1;');\n  });\n\n  test('screen teardown invalidates both pending impact requests', () => {\n    expect(source).toMatch(/useEffect\\(\\(\\) => \\(\\) => \\{[\\s\\S]*driverImpactRequestId\\.current \\+= 1;[\\s\\S]*vehicleImpactRequestId\\.current \\+= 1;/);\n  });\n});\n`);
