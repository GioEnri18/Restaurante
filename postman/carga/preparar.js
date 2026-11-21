// Prepara la prueba de carga contra una API LOCAL apuntando a una BD aislada (ej. pos_restaurante_carga):
// rol AUDITOR, 8 cajeros, 2 auditores, 1 admin extra (+ admin del seed), caja abierta y stock alto.
// Las contraseñas de prueba se generan aquí y quedan solo en usuarios.json (ignorado por git).
// NUNCA ejecutar contra producción: crea usuarios, ventas, mermas y anulaciones de prueba.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4000/api/v1';
const host = new URL(BASE).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  console.error(`Solo se permite contra una API local; BASE_URL apunta a ${host}.`);
  process.exit(1);
}
// Admin del seed. Si SEED_ADMIN_PASSWORD está vacío, el seed usa su valor por defecto de desarrollo.
const ADMIN_SEED = {
  identifier: process.env.CARGA_ADMIN_USER || 'admin',
  password: process.env.CARGA_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
};

let cookie = '';
async function api(method, ruta, body) {
  const res = await fetch(BASE + ruta, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${ruta} -> ${res.status} ${JSON.stringify(json?.error)}`);
  return json.data;
}

(async () => {
  await api('POST', '/auth/login', ADMIN_SEED);
  const roles = await api('GET', '/accesos/roles');
  const permisos = (await api('GET', '/accesos/permisos')).lista;
  const idPermiso = (c) => permisos.find((p) => p.codigo === c).id;
  const rolId = (c) => roles.find((r) => r.codigo === c)?.id;

  let auditorRolId = rolId('AUDITOR');
  if (!auditorRolId) {
    const rol = await api('POST', '/accesos/roles', {
      codigo: 'AUDITOR',
      nombre: 'Auditor',
      descripcion: 'Consulta de auditoría, facturas, reportes, inventario y caja (solo lectura)',
      vistaInicial: '/auditoria',
      permisoIds: ['auditoria:ver', 'facturas:ver', 'reportes:ver', 'reportes:exportar', 'inventario:ver', 'mermas:ver', 'caja:ver'].map(idPermiso),
    });
    auditorRolId = rol.id;
  }

  const usuarios = [];
  const crear = async (rol, prefijo, n, rolIdNum) => {
    for (let i = 1; i <= n; i++) {
      const username = `${prefijo}${i}`;
      const password = `Qa${crypto.randomBytes(9).toString('base64url')}9`;
      await api('POST', '/accesos/usuarios', {
        nombreCompleto: `${rol} de carga ${i}`,
        username,
        email: `${username}@carga.local`,
        password,
        rolId: rolIdNum,
      });
      usuarios.push({ rol, username, password });
    }
  };
  await crear('cajero', 'cajero', 8, rolId('CAJERO'));
  await crear('auditor', 'auditor', 2, auditorRolId);
  await crear('admin', 'admincarga', 1, rolId('ADMIN'));
  usuarios.push({ rol: 'admin', username: ADMIN_SEED.identifier, password: ADMIN_SEED.password });

  // Caja abierta (compartida por la sucursal) y stock suficiente para toda la prueba
  const actual = await api('GET', '/caja/actual');
  if (!actual) await api('POST', '/caja/abrir', { montoInicial: 500 });
  const ingredientes = await api('GET', '/inventario/ingredientes');
  const proveedores = await api('GET', '/inventario/proveedores');
  await api('POST', '/inventario/compras', {
    proveedorId: proveedores[0].id,
    numeroDocumento: 'CARGA-INICIAL',
    items: ingredientes.map((i) => ({ ingredienteId: i.id, cantidadLb: 400, precioPorLb: 20 })),
  });

  fs.writeFileSync(path.join(__dirname, 'usuarios.json'), JSON.stringify(usuarios, null, 1));
  console.log(`Usuarios: ${usuarios.map((u) => `${u.rol}:${u.username}`).join(', ')}`);
  console.log(`Ingredientes reabastecidos: ${ingredientes.length} (+400 lb c/u)`);
})().catch((e) => {
  console.error('Fallo preparando la carga:', e.message);
  process.exit(1);
});
