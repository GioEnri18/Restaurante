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

/** Cliente HTTP con su propia sesión (cookie) para que cada usuario actúe con sus permisos */
function sesion() {
  let cookie = '';
  return async function api(method, ruta, body, { permitir = [] } = {}) {
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
    if (!res.ok && !permitir.includes(res.status)) {
      throw new Error(`${method} ${ruta} -> ${res.status} ${JSON.stringify(json?.error)}`);
    }
    return permitir.includes(res.status) ? { status: res.status, json } : json.data;
  };
}

// Precios de prueba del menú BX (GTQ). Los combos (BX-19 a BX-22) siguen pendientes de definir.
const PRECIOS_BX = {
  'BX-01': 60, 'BX-02': 55, 'BX-10': 70, 'BX-11': 70, 'BX-17': 58,
  'BX-03': 50, 'BX-04': 55, 'BX-05': 50, 'BX-06': 65, 'BX-07': 48, 'BX-08': 50, 'BX-09': 40,
  'BX-12': 55, 'BX-13': 60, 'BX-14': 55, 'BX-15': 40, 'BX-16': 45,
  'BX-18-N': 35, 'BX-18-P': 35, 'BX-18-C': 38,
  'BX-23': 15, 'BX-24': 15, 'BX-25': 15,
  'BX-26': 12, 'BX-27': 12, 'BX-28': 12, 'BX-29': 12, 'BX-30': 12, 'BX-31': 8, 'BX-32': 10, 'BX-33': 10,
};

// Inventario nuevo con código único (además de los insumos del menú BX)
const INVENTARIO_NUEVO = [
  { codigo: 'INV-TOM-001', nombre: 'Tomate manzano', precioPorLb: 6 },
  { codigo: 'INV-AGU-001', nombre: 'Agua pura garrafón 5 gal', precioPorLb: 1.5 },
  { codigo: 'INV-HIE-001', nombre: 'Hielo en cubos', precioPorLb: 1 },
  { codigo: 'INV-LIM-001', nombre: 'Limón persa', precioPorLb: 5 },
];

(async () => {
  const admin = sesion();
  await admin('POST', '/auth/login', ADMIN_SEED);
  const roles = await admin('GET', '/accesos/roles');
  const permisos = (await admin('GET', '/accesos/permisos')).lista;
  const idPermiso = (c) => permisos.find((p) => p.codigo === c)?.id;
  const rolId = (c) => roles.find((r) => r.codigo === c)?.id;

  // 1. Rol Auditor (solo lectura) con permiso para autorizar apertura y cierre de caja
  let auditorRolId = rolId('AUDITOR');
  if (!auditorRolId) {
    const rol = await admin('POST', '/accesos/roles', {
      codigo: 'AUDITOR',
      nombre: 'Auditor',
      descripcion: 'Consulta de auditoría, facturas, reportes, inventario y caja; autoriza aperturas y cierres',
      vistaInicial: '/auditoria',
      permisoIds: ['auditoria:ver', 'facturas:ver', 'reportes:ver', 'reportes:exportar', 'inventario:ver',
        'mermas:ver', 'caja:ver', 'caja:autorizar'].map(idPermiso).filter(Boolean),
    });
    auditorRolId = rol.id;
  }

  // 2. Usuarios: 8 cajeros, 2 auditores y 1 administrador extra (+ el admin del seed)
  const usuarios = [];
  const crear = async (rol, prefijo, n, rolIdNum) => {
    for (let i = 1; i <= n; i++) {
      const username = `${prefijo}${i}`;
      const password = `Qa${crypto.randomBytes(9).toString('base64url')}9`;
      await admin('POST', '/accesos/usuarios', {
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

  // 3. Inventario nuevo con código único y rechazo de código repetido
  const proveedores = await admin('GET', '/inventario/proveedores');
  for (const ing of INVENTARIO_NUEVO) {
    await admin('POST', '/inventario/ingredientes', {
      codigo: ing.codigo,
      nombre: ing.nombre,
      proveedorId: proveedores[0].id,
      stockMinimo: 5,
      unidadStockMinimo: 'lb',
      stockInicial: 20,
      unidadStockInicial: 'lb',
      precioPorLb: ing.precioPorLb,
    });
  }
  const repetido = await admin('POST', '/inventario/ingredientes', {
    codigo: INVENTARIO_NUEVO[0].codigo, nombre: 'Tomate duplicado', stockMinimo: 1, unidadStockMinimo: 'lb',
  }, { permitir: [409] });
  if (repetido.status !== 409) throw new Error('Un código de ingrediente repetido debería rechazarse con 409');

  // 4. Compra para todos los insumos (incluye los 55 del menú BX, que empiezan en 0)
  const ingredientes = await admin('GET', '/inventario/ingredientes');
  await admin('POST', '/inventario/compras', {
    proveedorId: proveedores[0].id,
    numeroDocumento: 'CARGA-INICIAL',
    items: ingredientes.map((i) => ({ ingredienteId: i.id, cantidadLb: 400, precioPorLb: 20 })),
  });

  // 5. Precios y disponibilidad del menú BX (borradores -> a la venta)
  const menu = await admin('GET', '/ventas/menu');
  let conPrecio = 0;
  for (const p of menu.platillos.filter((x) => PRECIOS_BX[x.sku] !== undefined)) {
    await admin('PUT', `/ventas/platillos/${p.id}`, {
      precioVenta: PRECIOS_BX[p.sku],
      disponible: true,
      motivo: 'Precio de prueba de carga',
    });
    conPrecio++;
  }

  // 6. El CAJERO abre la caja con autorización de un administrador (control dual)
  const cajero1 = usuarios.find((u) => u.username === 'cajero1');
  const caja = sesion();
  await caja('POST', '/auth/login', { identifier: cajero1.username, password: cajero1.password });
  const actual = await caja('GET', '/caja/actual');
  if (!actual) {
    const sinSupervisor = await caja('POST', '/caja/abrir', { montoInicial: 500 }, { permitir: [400] });
    if (sinSupervisor.status !== 400) throw new Error('El cajero no debería abrir caja sin supervisor');
    const abierta = await caja('POST', '/caja/abrir', {
      montoInicial: 500,
      observaciones: 'Apertura de la prueba de carga',
      autorizacion: { identifier: ADMIN_SEED.identifier, password: ADMIN_SEED.password },
    });
    console.log(`Caja #${abierta.id} abierta por cajero1, autorizada por ${ADMIN_SEED.identifier}`);
  }

  fs.writeFileSync(path.join(__dirname, 'usuarios.json'), JSON.stringify(usuarios, null, 1));
  console.log(`Usuarios: ${usuarios.map((u) => `${u.rol}:${u.username}`).join(', ')}`);
  console.log(`Inventario nuevo: ${INVENTARIO_NUEVO.map((i) => i.codigo).join(', ')} (código repetido rechazado con 409)`);
  console.log(`Compra: ${ingredientes.length} ingredientes (+400 lb c/u) | Platillos BX con precio: ${conPrecio}`);
})().catch((e) => {
  console.error('Fallo preparando la carga:', e.message);
  process.exit(1);
});
