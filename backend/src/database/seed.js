const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { PERMISOS_CATALOGO } = require('../config/constants');
const { disconnectDatabase, sequelize } = require('../config/database');
const { env } = require('../config/env');
const { Categoria, Ingrediente, InventarioMovimiento, MenuEspecial, Mesa, Permiso, Platillo, Proveedor, RecetaIngrediente, Rol, RolPermiso, Sucursal, TipoMovimientoInventario, Usuario } = require('../models');
const { UnitConversionService } = require('../shared/services/unitConversion.service');
const { nowInTimezone } = require('../shared/utils/dates');
function resolveSeedPassword(envKey, devDefault) {
    const fromEnv = process.env[envKey]?.trim();
    if (fromEnv && fromEnv.length > 0) {
        return fromEnv;
    }
    if (env.NODE_ENV === 'production') {
        throw new Error(`La variable de entorno ${envKey} es obligatoria cuando se ejecuta seed en producción.`);
    }
    return devDefault;
}

async function main() {
    // Fase 2.5: Bloquear ejecución accidental de seed en producción salvo bandera explícita
    if (env.NODE_ENV === 'production' && !env.ALLOW_SEED_IN_PRODUCTION) {
        console.error('❌ Seed bloqueado: no se permite cargar datos de prueba con NODE_ENV=production (define ALLOW_SEED_IN_PRODUCTION=true si realmente lo necesitas).');
        process.exit(1);
    }
    console.log('🌱 Iniciando carga de datos de prueba con Sequelize (POS Restaurante Guatemala)...');
    await sequelize.authenticate();
    // 1. Sucursal principal
    const [sucursal] = await Sucursal.findOrCreate({
        where: { codigo: 'SUC-01' },
        defaults: {
            codigo: 'SUC-01',
            nombre: 'La Parrilla Chapina - Zona 10',
            nit: '10482931-4',
            direccion: '4a Avenida 12-45 Zona 10, Ciudad de Guatemala',
            telefono: '+502 2367-8900',
            serieFactura: 'A',
            correlativoActual: 0,
            correlativoComanda: 0,
        },
    });
    // 2. Permisos maestros
    const permisosMap = new Map();
    for (const p of PERMISOS_CATALOGO) {
        const [permiso] = await Permiso.findOrCreate({
            where: { codigo: p.codigo },
            defaults: { ...p },
        });
        await permiso.update({ descripcion: p.descripcion, vista: p.vista, accion: p.accion });
        permisosMap.set(permiso.codigo, permiso.id);
    }
    // 3. Roles configurables
    const rolesConfig = [
        {
            codigo: 'ADMIN',
            nombre: 'Administrador',
            descripcion: 'Control total del restaurante, reportes, auditoría y administración de accesos',
            vistaInicial: '/reportes',
            esSistema: true,
            permisos: PERMISOS_CATALOGO.map((p) => p.codigo),
        },
        {
            codigo: 'CAJERO',
            nombre: 'Cajero',
            descripcion: 'Toma de órdenes en mostrador y control/cuadre de caja diaria',
            vistaInicial: '/ventas',
            esSistema: true,
            permisos: [
                'ventas:ver',
                'ventas:crear',
                'caja:ver',
                'caja:abrir',
                'caja:movimiento',
                'caja:cerrar',
                'facturas:ver',
                'facturas:reimprimir',
                'mermas:ver',
                'mermas:crear',
            ],
        },
        {
            codigo: 'MESERO',
            nombre: 'Mesero',
            descripcion: 'Atención en mesa y pedidos para llevar desde el menú táctil',
            vistaInicial: '/ventas',
            esSistema: true,
            permisos: ['ventas:ver', 'ventas:crear', 'facturas:ver'],
        },
        {
            codigo: 'AUDITOR',
            nombre: 'Auditor económico',
            descripcion: 'Supervisión de caja y consulta de solo lectura sobre reportes, auditoría, facturas, inventario y mermas',
            vistaInicial: '/auditoria',
            esSistema: false,
            permisos: [
                'reportes:ver',
                'reportes:exportar',
                'auditoria:ver',
                'auditoria:exportar',
                'auditoria:economica',
                'reportes:balance',
                'ventas:autorizar_cortesia',
                'facturas:ver',
                'caja:ver',
                'caja:autorizar',
                'inventario:ver',
                'mermas:ver',
            ],
        },
        {
            codigo: 'AUDITOR_SISTEMA',
            nombre: 'Auditor de sistema',
            descripcion: 'Consultar la bitácora de actividad y seguridad',
            vistaInicial: '/auditoria',
            esSistema: false,
            permisos: ['auditoria:ver', 'auditoria:sistema', 'auditoria:exportar'],
        },
    ];
    const rolesMap = new Map();
    for (const rc of rolesConfig) {
        const [rol] = await Rol.findOrCreate({
            where: { codigo: rc.codigo },
            defaults: {
                codigo: rc.codigo,
                nombre: rc.nombre,
                descripcion: rc.descripcion,
                vistaInicial: rc.vistaInicial,
                esSistema: rc.esSistema,
            },
        });
        await rol.update({
            nombre: rc.nombre,
            descripcion: rc.descripcion,
            vistaInicial: rc.vistaInicial,
        });
        rolesMap.set(rol.codigo, rol.id);
        const permisoIdsDeseados = rc.permisos
            .map((codigoPermiso) => permisosMap.get(codigoPermiso))
            .filter((id) => Boolean(id));
        await RolPermiso.destroy({
            where: {
                rolId: rol.id,
                permisoId: { [Op.notIn]: permisoIdsDeseados },
            },
        });
        for (const permisoId of permisoIdsDeseados) {
            await RolPermiso.findOrCreate({
                where: { rolId: rol.id, permisoId },
                defaults: { rolId: rol.id, permisoId },
            });
        }
    }
    // 4. Usuarios de prueba (Fase 2.5: contraseñas desde env, con respaldo solo para desarrollo)
    const usuariosSeed = [
        {
            username: 'admin',
            nombreCompleto: 'Carlos Méndez (Administrador)',
            email: 'admin@parrillachapina.gt',
            passwordPlain: resolveSeedPassword('SEED_ADMIN_PASSWORD', 'Admin123!'),
            rolCodigo: 'ADMIN',
        },
        {
            username: 'cajero',
            nombreCompleto: 'Sofía Morales (Cajera)',
            email: 'cajero@parrillachapina.gt',
            passwordPlain: resolveSeedPassword('SEED_CAJERO_PASSWORD', 'Cajero123!'),
            rolCodigo: 'CAJERO',
        },
        {
            username: 'mesero',
            nombreCompleto: 'Luis Herrera (Mesero)',
            email: 'mesero@parrillachapina.gt',
            passwordPlain: resolveSeedPassword('SEED_MESERO_PASSWORD', 'Mesero123!'),
            rolCodigo: 'MESERO',
        },
    ];
    let adminUserId = 1;
    for (const u of usuariosSeed) {
        const passwordHash = await bcrypt.hash(u.passwordPlain, env.BCRYPT_SALT_ROUNDS);
        const [usuario] = await Usuario.findOrCreate({
            where: { username: u.username },
            defaults: {
                sucursalId: sucursal.id,
                rolId: rolesMap.get(u.rolCodigo),
                nombreCompleto: u.nombreCompleto,
                username: u.username,
                email: u.email,
                passwordHash,
            },
        });
        if (u.username === 'admin')
            adminUserId = usuario.id;
    }
    // 5. Mesas
    const mesasNumeros = ['M-01', 'M-02', 'M-03', 'M-04', 'M-05', 'M-06', 'M-07', 'M-08'];
    for (const [idx, numero] of mesasNumeros.entries()) {
        await Mesa.findOrCreate({
            where: { sucursalId: sucursal.id, numero },
            defaults: { sucursalId: sucursal.id, numero, capacidad: idx < 4 ? 4 : 6 },
        });
    }
    // 6. Proveedores
    const proveedoresData = [
        { nombre: 'Carnicería El Buen Corte S.A.', nit: '8823412-9', telefono: '2331-4400', email: 'ventas@elbuencorte.gt', contacto: 'Jorge Castillo' },
        { nombre: 'Distribuidora Agrícola del Altiplano', nit: '5512980-3', telefono: '2250-1122', email: 'pedidos@altiplano.gt', contacto: 'María López' },
        { nombre: 'Lácteos y Quesos San José', nit: '4490123-1', telefono: '2471-8899', email: 'contacto@lacteossanjose.gt', contacto: 'Pedro Ramírez' },
        { nombre: 'Abarrotes y Bebidas del Sur', nit: '7765120-5', telefono: '2388-5510', email: 'ordenes@abarrsur.gt', contacto: 'Ana Lucía Pérez' },
    ];
    const proveedoresIds = [];
    for (const p of proveedoresData) {
        const [prov] = await Proveedor.findOrCreate({
            where: { sucursalId: sucursal.id, nombre: p.nombre },
            defaults: { sucursalId: sucursal.id, ...p },
        });
        proveedoresIds.push(prov.id);
    }
    // 7. Ingredientes
    const ingredientesSeed = [
        { codigo: 'ING-001', nombre: 'Lomito de Res (Churrasco)', provIdx: 0, stockLb: 25, minLb: 5, precioLb: 56.0 },
        { codigo: 'ING-002', nombre: 'Pechuga de Pollo', provIdx: 0, stockLb: 20, minLb: 5, precioLb: 24.0 },
        { codigo: 'ING-003', nombre: 'Longaniza Artesanal', provIdx: 0, stockLb: 10, minLb: 3, precioLb: 32.0 },
        { codigo: 'ING-004', nombre: 'Carne Molida de Res', provIdx: 0, stockLb: 15, minLb: 4, precioLb: 34.0 },
        { codigo: 'ING-005', nombre: 'Aguacate Hass', provIdx: 1, stockLb: 2.5, minLb: 3, precioLb: 18.0 },
        { codigo: 'ING-006', nombre: 'Tomate Manzano', provIdx: 1, stockLb: 14, minLb: 4, precioLb: 6.5 },
        { codigo: 'ING-007', nombre: 'Papa para Freír', provIdx: 1, stockLb: 30, minLb: 6, precioLb: 5.5 },
        { codigo: 'ING-008', nombre: 'Frijol Negro Volteado', provIdx: 1, stockLb: 18, minLb: 4, precioLb: 8.0 },
        { codigo: 'ING-009', nombre: 'Queso Mozzarella', provIdx: 2, stockLb: 2, minLb: 2.5, precioLb: 38.0 },
        { codigo: 'ING-010', nombre: 'Crema Fresca', provIdx: 2, stockLb: 8, minLb: 2, precioLb: 20.0 },
        { codigo: 'ING-011', nombre: 'Masa de Maíz (Tortillas)', provIdx: 3, stockLb: 22, minLb: 5, precioLb: 4.5 },
        { codigo: 'ING-012', nombre: 'Pulpa Natural (Limón / Jamaica)', provIdx: 3, stockLb: 16, minLb: 3, precioLb: 12.0 },
        { codigo: 'ING-013', nombre: 'Plátano Maduro', provIdx: 1, stockLb: 12, minLb: 3, precioLb: 7.0 },
    ];
    const ingredientesMap = new Map();
    for (const ing of ingredientesSeed) {
        const stockOz = UnitConversionService.lbToOz(ing.stockLb);
        const minOz = UnitConversionService.lbToOz(ing.minLb);
        const costoOz = UnitConversionService.pricePerLbToCostPerOz(ing.precioLb);
        const [registro, created] = await Ingrediente.findOrCreate({
            where: { sucursalId: sucursal.id, codigo: ing.codigo },
            defaults: {
                sucursalId: sucursal.id,
                proveedorId: proveedoresIds[ing.provIdx],
                codigo: ing.codigo,
                nombre: ing.nombre,
                stockActualOz: stockOz,
                stockMinimoOz: minOz,
                costoPromedioOz: costoOz,
            },
        });
        ingredientesMap.set(ing.codigo, registro.id);
        if (created) {
            await InventarioMovimiento.create({
                sucursalId: sucursal.id,
                ingredienteId: registro.id,
                usuarioId: adminUserId,
                tipo: TipoMovimientoInventario.ENTRADA_COMPRA,
                cantidadOz: stockOz,
                stockAnteriorOz: 0,
                stockNuevoOz: stockOz,
                costoUnitarioOz: costoOz,
                referenciaTipo: 'SEED_INICIAL',
                motivo: `Stock inicial (${ing.stockLb} lb = ${stockOz} oz)`,
            });
        }
    }
    // 8. Categorías y Platillos
    const categoriasSeed = [
        { nombre: 'Entradas', descripcion: 'Antojitos chapines y entradas para compartir', orden: 1 },
        { nombre: 'Parrilla y Carnes', descripcion: 'Cortes al carbón y parrilladas tradicionales', orden: 2 },
        { nombre: 'Platos Fuertes', descripcion: 'Especialidades de la casa y hamburguesas', orden: 3 },
        { nombre: 'Bebidas', descripcion: 'Refrescos naturales y bebidas frías', orden: 4 },
        { nombre: 'Postres', descripcion: 'Dulces tradicionales recién preparados', orden: 5 },
    ];
    const categoriasMap = new Map();
    for (const cat of categoriasSeed) {
        const [c] = await Categoria.findOrCreate({
            where: { sucursalId: sucursal.id, nombre: cat.nombre },
            defaults: { sucursalId: sucursal.id, ...cat },
        });
        categoriasMap.set(cat.nombre, c.id);
    }
    const platillosSeed = [
        { sku: 'ENT-01', categoria: 'Entradas', nombre: 'Guacamol con Nachos', descripcion: 'Aguacate Hass machacado al momento, tomate y totopos crujientes', precioVenta: 38.0, receta: [{ codigo: 'ING-005', oz: 5 }, { codigo: 'ING-006', oz: 2 }, { codigo: 'ING-011', oz: 4 }] },
        { sku: 'ENT-02', categoria: 'Entradas', nombre: 'Queso Fundido con Longaniza', descripcion: 'Queso mozzarella gratinado al horno con longaniza artesanal y tortillas', precioVenta: 52.0, receta: [{ codigo: 'ING-009', oz: 5 }, { codigo: 'ING-003', oz: 4 }, { codigo: 'ING-011', oz: 4 }] },
        { sku: 'ENT-03', categoria: 'Entradas', nombre: 'Papas Fritas Supremas', descripcion: 'Papas crujientes bañadas en queso fundido y crema fresca', precioVenta: 34.0, receta: [{ codigo: 'ING-007', oz: 8 }, { codigo: 'ING-009', oz: 2 }, { codigo: 'ING-010', oz: 2 }] },
        { sku: 'PAR-01', categoria: 'Parrilla y Carnes', nombre: 'Churrasco Chapín 8 oz', descripcion: 'Lomito a la parrilla, guacamol, frijol volteado, chirmol y tortillas', precioVenta: 95.0, receta: [{ codigo: 'ING-001', oz: 8 }, { codigo: 'ING-005', oz: 3 }, { codigo: 'ING-008', oz: 4 }, { codigo: 'ING-006', oz: 3 }, { codigo: 'ING-011', oz: 4 }] },
        { sku: 'PAR-02', categoria: 'Parrilla y Carnes', nombre: 'Pechuga a la Plancha', descripcion: 'Pechuga marinada con hierbas, papas fritas y ensalada fresca', precioVenta: 72.0, receta: [{ codigo: 'ING-002', oz: 8 }, { codigo: 'ING-007', oz: 6 }, { codigo: 'ING-006', oz: 3 }] },
        { sku: 'PAR-03', categoria: 'Parrilla y Carnes', nombre: 'Parrillada Mixta para 2', descripcion: 'Lomito, pechuga y longaniza con guarniciones chapinas completas', precioVenta: 185.0, receta: [{ codigo: 'ING-001', oz: 10 }, { codigo: 'ING-002', oz: 8 }, { codigo: 'ING-003', oz: 6 }, { codigo: 'ING-008', oz: 6 }, { codigo: 'ING-005', oz: 4 }, { codigo: 'ING-011', oz: 8 }] },
        { sku: 'PLT-01', categoria: 'Platos Fuertes', nombre: 'Hamburguesa de la Casa', descripcion: 'Carne 100% res 6 oz, queso mozzarella derretido y papas fritas', precioVenta: 68.0, receta: [{ codigo: 'ING-004', oz: 6 }, { codigo: 'ING-009', oz: 2 }, { codigo: 'ING-006', oz: 2 }, { codigo: 'ING-007', oz: 6 }] },
        { sku: 'PLT-02', categoria: 'Platos Fuertes', nombre: 'Tacos de Pollo Gratinados (3 u)', descripcion: 'Tortillas suaves con pechuga sazonada, mozzarella, aguacate y crema', precioVenta: 58.0, receta: [{ codigo: 'ING-002', oz: 6 }, { codigo: 'ING-009', oz: 2.5 }, { codigo: 'ING-005', oz: 2 }, { codigo: 'ING-010', oz: 1.5 }, { codigo: 'ING-011', oz: 4 }] },
        { sku: 'BEB-01', categoria: 'Bebidas', nombre: 'Limonada con Soda (16 oz)', descripcion: 'Limón recién exprimido con agua mineral bien fría', precioVenta: 22.0, receta: [{ codigo: 'ING-012', oz: 4 }] },
        { sku: 'BEB-02', categoria: 'Bebidas', nombre: 'Fresco de Rosa de Jamaica (16 oz)', descripcion: 'Infusión natural de flor de jamaica artesanal', precioVenta: 18.0, receta: [{ codigo: 'ING-012', oz: 4 }] },
        { sku: 'BEB-03', categoria: 'Bebidas', nombre: 'Jarra de Limonada (64 oz)', descripcion: 'Ideal para compartir en mesa (4 vasos)', precioVenta: 65.0, receta: [{ codigo: 'ING-012', oz: 14 }] },
        { sku: 'POS-01', categoria: 'Postres', nombre: 'Plátanos Fritos con Crema y Frijol', descripcion: 'Plátanos maduros dorados acompañados de crema fresca y frijol', precioVenta: 32.0, receta: [{ codigo: 'ING-013', oz: 6 }, { codigo: 'ING-010', oz: 2.5 }, { codigo: 'ING-008', oz: 2 }] },
    ];
    for (const p of platillosSeed) {
        const [platillo] = await Platillo.findOrCreate({
            where: { sucursalId: sucursal.id, sku: p.sku },
            defaults: {
                sucursalId: sucursal.id,
                categoriaId: categoriasMap.get(p.categoria),
                sku: p.sku,
                nombre: p.nombre,
                descripcion: p.descripcion,
                precioVenta: p.precioVenta,
                disponible: true,
                activo: true,
            },
        });
        for (const r of p.receta) {
            const ingredienteId = ingredientesMap.get(r.codigo);
            if (!ingredienteId)
                continue;
            const [rec] = await RecetaIngrediente.findOrCreate({
                where: { platilloId: platillo.id, ingredienteId },
                defaults: { platilloId: platillo.id, ingredienteId, cantidadOz: r.oz },
            });
            await rec.update({ cantidadOz: r.oz });
        }
    }
    // 9. Menú especial próximo de ejemplo
    const menuEspExistente = await MenuEspecial.findOne({ where: { sucursalId: sucursal.id } });
    if (!menuEspExistente) {
        const hoyGt = nowInTimezone();
        const inicioEspecial = hoyGt.plus({ days: 2 }).startOf('day').toJSDate();
        const finEspecial = hoyGt.plus({ days: 5 }).endOf('day').toJSDate();
        await MenuEspecial.create({
            sucursalId: sucursal.id,
            creadoPorId: adminUserId,
            nombre: 'Menú Especial Fin de Semana Festivo',
            descripcion: 'Menú temporal de temporada. Recuerda asignar platillos y precios especiales antes del inicio.',
            fechaInicio: inicioEspecial,
            fechaFin: finEspecial,
            diasAvisoPrevio: 5,
            activo: true,
            esMenuPrincipal: false,
        });
    }
    console.log('✅ Seed Sequelize completado exitosamente.');
}
main()
    .catch((e) => {
    console.error('❌ Error ejecutando seed Sequelize:', e);
    process.exit(1);
})
    .finally(async () => {
    await disconnectDatabase();
});
