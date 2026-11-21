// Estadísticas por ruta (orden de ejecución), códigos HTTP y fallos de tests de Postman.
const fs = require('node:fs');
const path = require('node:path');
const archivo = process.argv[2] || 'resultados.json';
const { duracionMs, registros } = JSON.parse(fs.readFileSync(path.join(__dirname, archivo), 'utf8'));

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const peticiones = registros.filter((r) => r.ruta);
const rutas = new Map();
for (const r of peticiones) {
  const k = `${r.rol}|${r.ruta}`;
  if (!rutas.has(k)) rutas.set(k, []);
  rutas.get(k).push(r);
}

const filas = [];
for (const [k, lista] of rutas) {
  const [rol, ruta] = k.split('|');
  const ms = lista.filter((r) => r.ms !== null).map((r) => r.ms);
  const codigos = {};
  for (const r of lista) codigos[r.codigo] = (codigos[r.codigo] ?? 0) + 1;
  filas.push({
    rol,
    ruta,
    n: lista.length,
    p50: pct(ms, 50),
    p95: pct(ms, 95),
    p99: pct(ms, 99),
    max: Math.max(...ms),
    prom: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    codigos: Object.entries(codigos).map(([c, n]) => `${c}×${n}`).join(' '),
  });
}
console.log(`Duración: ${(duracionMs / 1000).toFixed(1)} s | Peticiones: ${peticiones.length} | Throughput: ${(peticiones.length / (duracionMs / 1000)).toFixed(1)} req/s`);
console.table(filas);

const todos = peticiones.filter((r) => r.ms !== null).map((r) => r.ms);
console.log(`Global ms -> p50 ${pct(todos, 50)} | p95 ${pct(todos, 95)} | p99 ${pct(todos, 99)} | max ${Math.max(...todos)}`);
const porRol = {};
for (const rol of ['cajero', 'admin', 'auditor']) {
  const ms = peticiones.filter((r) => r.rol === rol && r.ms !== null).map((r) => r.ms);
  porRol[rol] = { n: ms.length, p50: pct(ms, 50), p95: pct(ms, 95), p99: pct(ms, 99) };
}
console.table(porRol);

const fallos = registros.filter((r) => r.fallo);
const agrupados = {};
for (const f of fallos) agrupados[`${f.rol}: ${f.fallo}`] = (agrupados[`${f.rol}: ${f.fallo}`] ?? 0) + 1;
console.log('Fallos de tests:', agrupados);
const errores = peticiones.filter((r) => r.codigo === 'ERROR');
if (errores.length) console.log('Errores de red:', errores.slice(0, 3));
