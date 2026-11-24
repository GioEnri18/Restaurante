import React from 'react';
import { HelpCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';

interface GuiaSeccion {
  titulo: string;
  resumen: string;
  pasos: string[];
  consejo?: string;
}

const GUIAS_POR_RUTA: Record<string, GuiaSeccion> = {
  '/ventas': {
    titulo: 'Cómo tomar un pedido y cobrar',
    resumen: 'Esta es la pantalla principal para atender clientes en mostrador o para llevar.',
    pasos: [
      'Verifica arriba que la caja esté en verde («Caja Abierta»). Si está cerrada, toca «Abrir Caja».',
      'Toca los platillos del menú para sumarlos a la orden de la derecha (puedes buscar por nombre o filtrar por categoría).',
      'Si el cliente pide algún cambio (ej. «Sin cebolla»), toca el botón «Nota» en el platillo.',
      'Presiona el botón naranja «Cobrar», elige Efectivo o Tarjeta y confirma para emitir factura y comanda.',
    ],
    consejo:
      'Si un platillo aparece como «Falta precio», «Pendiente activar» o «Sin stock», el Administrador puede activarlo desde Inventario → Recetas y Precios.',
  },
  '/caja': {
    titulo: 'Cómo abrir, controlar y cerrar caja',
    resumen: 'Aquí controlas el efectivo que entra y sale durante el turno.',
    pasos: [
      'Al iniciar el día, ingresa el fondo inicial de efectivo en gaveta (ej. Q500.00) y abre turno.',
      'Si eres Cajero, un Administrador o Auditor ingresará su usuario y contraseña para autorizar la apertura o el cierre.',
      'Durante el turno puedes registrar entradas o salidas manuales (por ejemplo pago a repartidor o compra menor).',
      'Al terminar, cuenta el efectivo físico, usa «Cuadrar y cerrar turno» y revisa si el cuadre está exacto.',
    ],
  },
  '/facturas': {
    titulo: 'Cómo consultar, reimprimir o anular facturas',
    resumen: 'Encuentra cualquier venta pasada por número de factura, cliente o NIT.',
    pasos: [
      'Usa el buscador rápido o abre «Más filtros» para buscar por fechas y montos.',
      'Pulsa «Ver» en cualquier factura para revisar todos los platillos cobrados y su desglose de IVA.',
      'Si necesitas volver a imprimir el comprobante, usa el botón «Reimprimir».',
      'Si hubo un error y tienes permiso, puedes anularla escribiendo el motivo (con caja abierta).',
    ],
  },
  '/inventario': {
    titulo: 'Cómo manejar ingredientes, compras y activar platillos',
    resumen: 'Las compras se pueden registrar en libras (lb) u onzas (oz); el sistema convierte y actualiza el costo promedio automáticamente.',
    pasos: [
      'En «Existencias» ves cuánto queda de cada ingrediente y alertas si está por agotarse.',
      'En «Compras» registras lo que compraste al proveedor: esto suma stock y actualiza el costo promedio.',
      'En «Recetas y Precios» pones el precio de venta, ajustas la receta y activas los platillos para vender.',
    ],
    consejo:
      'Para que un platillo pueda venderse necesita: 1) Precio de venta, 2) Receta configurada y habilitada en ventas, y 3) Stock suficiente.',
  },
  '/mermas': {
    titulo: 'Cómo registrar una merma o desperdicio',
    resumen: 'Registra aquí ingredientes dañados, vencidos o echados a perder para que tu inventario siempre sea real.',
    pasos: [
      'Selecciona el ingrediente afectado y escribe la cantidad perdida (en onzas o libras).',
      'Elige el motivo (vencimiento, daño en cocina, etc.) y guarda.',
      'El sistema descuenta esa cantidad del inventario y deja constancia en auditoría.',
    ],
  },
  '/menus-especiales': {
    titulo: 'Cómo programar menús por fechas especiales',
    resumen: 'Crea promociones o menús de temporada (Día de la Madre, Navidad, fin de semana) con aviso anticipado.',
    pasos: [
      'Pulsa «Nueva temporada» y elige el nombre, las fechas de vigencia y cuándo recibir el aviso.',
      'Marca los platillos participantes y, si deseas, ponles un precio promocional temporal.',
      'Al llegar la fecha, el sistema los mostrará automáticamente en Menú / Ventas.',
    ],
  },
  '/reportes': {
    titulo: 'Cómo leer y exportar tus reportes',
    resumen: 'Consulta ventas del día, ganancias estimadas, platillos más vendidos y cierres de caja.',
    pasos: [
      'Elige el rango de fechas o usa los botones rápidos (Hoy, Esta semana, Este mes).',
      'Revisa los totales por método de pago (Efectivo vs. Tarjeta) y el margen de ganancia.',
      'Usa los botones de PDF o Excel para descargar el reporte y compartirlo o archivarlo.',
    ],
  },
  '/economia': {
    titulo: 'Cuadre económico mensual',
    resumen: 'Revisa el total vendido, los gastos y el resultado del restaurante.',
    pasos: [
      'Selecciona el mes que quieres consultar.',
      'Usa «Agregar gasto» junto a la tabla. Desde cada fila puedes editar o anular un gasto.',
      'Revisa la nómina y las mermas en el cuadre del mes.',
    ],
  },
  '/auditoria': {
    titulo: 'Bitácora de auditoría (solo lectura)',
    resumen: 'Registro permanente e inalterable de todas las acciones importantes del restaurante.',
    pasos: [
      'Filtra por usuario, acción o fechas para encontrar un movimiento.',
      'Pulsa «Ver cambio» en cualquier evento para comparar cómo estaba antes y cómo quedó después.',
    ],
  },
  '/accesos': {
    titulo: 'Cómo crear usuarios y configurar permisos',
    resumen: 'Solo el Administrador puede entrar aquí para dar de alta al equipo del restaurante.',
    pasos: [
      'Usa los botones de «Alta rápida por perfil» o «Agregar persona» para registrar a tu equipo.',
      'Configura su fecha de ingreso y sueldo mensual para llevar el control en Nómina.',
      'En la pestaña «Roles y Permisos» puedes activar o quitar permisos específicos de cada puesto sin programar.',
    ],
  },
};

const GUIA_DEFAULT: GuiaSeccion = {
  titulo: 'Guía rápida del Punto de Venta',
  resumen: 'Usa el menú de la izquierda para moverte entre ventas, caja, inventario y reportes.',
  pasos: [
    'Abre tu turno en «Caja» antes de comenzar a cobrar.',
    'Toma órdenes y cobra desde «Menú / Ventas».',
    'Consulta tus totales del día en «Caja» o «Reportes».',
  ],
};

interface QuickHelpModalProps {
  open: boolean;
  pathname: string;
  onClose: () => void;
}

export const QuickHelpModal: React.FC<QuickHelpModalProps> = ({ open, pathname, onClose }) => {
  const guia = GUIAS_POR_RUTA[pathname] ?? GUIA_DEFAULT;

  return (
    <Modal open={open} title={guia.titulo} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-brand-50 p-3.5 text-brand-950">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          <p className="text-sm font-medium leading-relaxed">{guia.resumen}</p>
        </div>

        <ol className="space-y-2.5">
          {guia.pasos.map((paso, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white">
                {idx + 1}
              </span>
              <span className="leading-snug">{paso}</span>
            </li>
          ))}
        </ol>

        {guia.consejo && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>{guia.consejo}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] w-full rounded-xl bg-slate-900 text-sm font-bold text-white hover:bg-slate-800"
        >
          Entendido
        </button>
      </div>
    </Modal>
  );
};
