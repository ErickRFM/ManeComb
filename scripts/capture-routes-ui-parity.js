const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('../mobile/node_modules/playwright');

const root = path.resolve(__dirname, '../ventas/dist');
const output = path.resolve(__dirname, '../docs/rc-rutas-ui-parity-after.png');
const point = (latitude, longitude) => ({ latitude, longitude });
const route = (id, name, color, offset) => ({
  id, name, code: id.toUpperCase(), color,
  origin: point(19.31 + offset, -98.25), destination: point(19.34 + offset, -98.19),
  originLabel: 'Terminal Poniente', destinationLabel: 'Centro de Tlaxcala',
  stops: [0, 1, 2, 3].map((index) => ({ id: `${id}-${index}`, address: `Checkpoint ${index + 1}`, order: index, latitude: 19.315 + offset + index * .006, longitude: -98.24 + index * .012 })),
  distanceMeters: 12000 + offset * 10000, durationSeconds: 1500, durationInTrafficSeconds: 1680,
  polyline: [point(19.31 + offset, -98.25), point(19.322 + offset, -98.235), point(19.318 + offset, -98.218), point(19.337 + offset, -98.205), point(19.34 + offset, -98.19)],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
const routes = [route('centro', 'Ruta Para El Centro', '#f0445f', 0), route('universidad', 'Ruta Universidad', '#ff9f1c', .008), route('industrial', 'Ruta Industrial', '#8b5cf6', -.006), route('norte', 'Ruta Norte', '#2f80ed', .014), route('mercado', 'Ruta Mercado', '#22c55e', -.012)];
const assignment = { routeId: routes[0].id, routeName: routes[0].name, routeColor: routes[0].color, originLabel: routes[0].originLabel, destinationLabel: routes[0].destinationLabel, origin: routes[0].origin, destination: routes[0].destination, stops: routes[0].stops, assignedAt: new Date().toISOString(), route: { label: routes[0].name, distanceMeters: routes[0].distanceMeters, durationSeconds: routes[0].durationSeconds, polyline: routes[0].polyline } };
const vehicles = ['C-1','C-2','C-3','C-4','C-5'].map((code, index) => ({ id: `v${index + 1}`, code, plate: `TLX-${index + 1}00`, status: index === 2 ? 'available' : 'assigned', driverName: ['Juan Pérez','Luis Gómez','Pepe Martínez','María Torres','Carlos Ramírez'][index], routeId: index === 0 ? routes[0].id : null, assignedRoute: index === 0 ? assignment : null }));
const user = { id: 'owner-1', name: 'Andrea Mercado', email: 'owner@manecomb.test', role: 'owner', accountType: 'company_owner', organizationId: 'demo', userStatus: 'active' };

function contentType(file) { return file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'text/html'; }
const server = http.createServer((req, res) => {
  const requested = req.url.split('?')[0];
  const candidate = path.join(root, requested === '/' ? 'index.html' : requested);
  const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': contentType(file) }); res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((resolve) => server.listen(5199, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1660, height: 950 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { localStorage.setItem('manecomb-ventas-token', 'visual-token'); localStorage.setItem('manecomb-ventas-refresh-token', 'visual-refresh'); });
  await page.route('**/api/**', async (requestRoute) => {
    const url = requestRoute.request().url();
    const data = url.includes('/auth/login') ? { user, token: 'visual-token', refreshToken: 'visual-refresh' } : url.includes('/auth/session') ? { user } : url.includes('/vehicles') ? vehicles : url.includes('/navigation/routes') ? routes : url.includes('/portal/overview') ? {} : [];
    await requestRoute.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
  await page.goto('http://127.0.0.1:5199/portal/rutas', { waitUntil: 'networkidle' });
  if (await page.getByText('Iniciar sesión', { exact: true }).count()) {
    const inputs = page.locator('input');
    await inputs.nth(0).fill('owner@manecomb.test'); await inputs.nth(1).fill('Ruta123!');
    await page.getByText('Entrar', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.goto('http://127.0.0.1:5199/portal/rutas', { waitUntil: 'networkidle' });
  }
  await page.screenshot({ path: output, fullPage: true });
  await browser.close(); server.close();
  console.log(output);
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
