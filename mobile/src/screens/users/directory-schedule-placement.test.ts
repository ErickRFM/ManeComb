const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('autoridad UI del horario operativo', () => {
  const mobileRoot = nodeProcess.cwd();
  const usersScreen = fs.readFileSync(
    path.join(mobileRoot, 'src', 'screens', 'users-screen.tsx'),
    'utf8'
  );
  const scheduleModal = fs.readFileSync(
    path.join(mobileRoot, 'src', 'screens', 'users', 'DriverScheduleModal.tsx'),
    'utf8'
  );
  const profileEditor = fs.readFileSync(
    path.join(mobileRoot, 'src', 'screens', 'company-profile-edit-screen.tsx'),
    'utf8'
  );
  const directoryApi = fs.readFileSync(
    path.join(mobileRoot, 'src', 'api', 'directory-admin-api.ts'),
    'utf8'
  );

  it('expone Horario como accion de conductor en Directorio', () => {
    expect(usersScreen).toContain('label="Horario"');
    expect(usersScreen).toContain('setScheduleDriver(entry)');
    expect(usersScreen).toContain('<DriverScheduleModal');
    expect(usersScreen).toContain("canManageUsers && entry.role === 'driver'");
  });

  it('guarda por la autoridad existente PATCH /users/:id', () => {
    expect(directoryApi).toContain('updateDriverOperationalScheduleRequest');
    expect(directoryApi).toContain('{ operationalSchedule }');
    expect(directoryApi).toContain('`/users/${encodeURIComponent(userId)}`');
  });

  it('ya no mezcla el horario operativo con editar perfil', () => {
    expect(profileEditor).not.toContain('Horario operativo');
    expect(profileEditor).not.toContain('scheduleStartTime');
    expect(profileEditor).not.toContain('operationalSchedule:');
  });

  it('no habilita la primera configuracion solo por abrir el modal', () => {
    expect(scheduleModal).toContain('const [dirty, setDirty] = useState(false)');
    expect(scheduleModal).toContain('setDirty(false)');
    expect(scheduleModal).toContain(': dirty');
    expect(scheduleModal).toContain('setDirty(true)');
    expect(scheduleModal).toContain('disabled={saving || !hasChanges}');
  });
});
