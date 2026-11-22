// Prueba de carga con Newman: 8 cajeros (400 peticiones en total), 2 administradores y 2 auditores
// AL MISMO TIEMPO, cada uno con su propia sesión (cookie jar). Escribe resultados.json.
// Uso: node preparar.js && node ejecutar.js && node analizar.js
const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
const { CookieJar } = require('tough-cookie');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4000/api/v1';
const cargar = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, `POS_Carga_${n}.postman_collection.json`), 'utf8'));
const COLECCION = { cajero: cargar('01_Cajero'), admin: cargar('02_Administrador'), auditor: cargar('03_Auditor') };
const LOGIN = cargar('00_Login');
// cajero: 10 iteraciones x 5 peticiones = 50 por cajero -> 400 con 8 cajeros
const ITERACIONES = { cajero: 10, admin: 6, auditor: 8 };
const usuarios = JSON.parse(fs.readFileSync(path.join(__dirname, 'usuarios.json'), 'utf8'));

function correr(coleccion, usuario, iteraciones, jar, registros) {
  return new Promise((resolve, reject) => {
    newman
      .run({
        collection: coleccion,
        iterationCount: iteraciones,
        cookieJar: jar,
        reporters: [],
        timeoutRequest: 30000,
        envVar: [
          { key: 'baseUrl', value: BASE },
          { key: 'username', value: usuario.username },
          { key: 'password', value: usuario.password },
        ],
      })
      .on('request', (err, args) => {
        registros.push({
          rol: usuario.rol,
          usuario: usuario.username,
          ruta: args.item.name,
          codigo: err ? 'ERROR' : args.response.code,
          ms: err ? null : args.response.responseTime,
          fin: Date.now(),
          error: err ? err.message : undefined,
        });
      })
      .on('assertion', (err, args) => {
        if (err) registros.push({ rol: usuario.rol, usuario: usuario.username, fallo: args.assertion, fin: Date.now() });
      })
      .on('done', (err, summary) => (err ? reject(err) : resolve(summary)));
  });
}

(async () => {
  const registros = [];
  const jars = new Map(usuarios.map((u) => [u.username, new CookieJar()]));
  // 12 inicios de sesión: dentro del límite por IP de /auth/login
  await Promise.all(usuarios.map((u) => correr(LOGIN, u, 1, jars.get(u.username), [])));

  const inicio = Date.now();
  await Promise.all(
    usuarios.map((u) => correr(COLECCION[u.rol], u, ITERACIONES[u.rol], jars.get(u.username), registros)),
  );
  const duracionMs = Date.now() - inicio;

  fs.writeFileSync(path.join(__dirname, 'resultados.json'), JSON.stringify({ inicio, duracionMs, registros }));
  const peticiones = registros.filter((r) => r.ruta);
  console.log(`Peticiones: ${peticiones.length} en ${(duracionMs / 1000).toFixed(1)} s`);
  for (const rol of ['cajero', 'admin', 'auditor']) {
    console.log(`  ${rol}: ${peticiones.filter((r) => r.rol === rol).length}`);
  }
  console.log(`Fallos de tests Postman: ${registros.filter((r) => r.fallo).length}`);

  // Cierre de caja por un CAJERO con autorización de un AUDITOR (control dual). Se cuenta
  // exactamente el efectivo esperado, así que la diferencia del arqueo debe ser 0.
  const cajero = usuarios.find((u) => u.username === 'cajero1');
  const auditor = usuarios.find((u) => u.rol === 'auditor');
  let cookie = '';
  const api = async (method, ruta, body) => {
    const r = await fetch(BASE + ruta, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const json = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${ruta} -> ${r.status} ${JSON.stringify(json?.error)}`);
    return json.data;
  };
  await api('POST', '/auth/login', { identifier: cajero.username, password: cajero.password });
  const actual = await api('GET', '/caja/actual');
  const cerrada = await api('POST', '/caja/cerrar', {
    montoContadoEfectivo: actual.montoEsperadoEfectivo,
    observacionesCierre: 'Cierre de la prueba de carga',
    autorizacion: { identifier: auditor.username, password: auditor.password },
  });
  console.log(
    `Caja #${cerrada.id} cerrada por ${cajero.username}, autorizada por ${auditor.username}: ` +
      `esperado Q${cerrada.montoEsperadoEfectivo} | contado Q${cerrada.montoContadoEfectivo} | diferencia Q${cerrada.diferencia}`,
  );
})().catch((e) => {
  console.error('Falló la ejecución:', e);
  process.exit(1);
});
