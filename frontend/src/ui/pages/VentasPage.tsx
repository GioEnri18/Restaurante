import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { env } from '../../config/env';
import { IngredienteModel, MenuDataModel, PlatilloModel, TicketImprimibleModel } from '../../models';
import { inventarioService } from '../../services/inventario.service';
import { ventasService } from '../../services/ventas.service';
import { useAuthStore } from '../../store/auth.store';
import { useCartStore } from '../../store/cart.store';
import { generarUuid } from '../../utils/idempotency';
import { calcularFaltantesPedido } from '../../utils/stockPedido';
import { calcularIvaIncluido } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import {
  NuevaCategoriaModal,
  NuevaCategoriaPayload,
} from '../components/inventario/NuevaCategoriaModal';
import { NuevoPlatilloModal } from '../components/inventario/NuevoPlatilloModal';
import { PrintTicketsModal } from '../components/print/PrintTicketsModal';
import { CarritoMobileSheet } from '../components/ventas/CarritoMobileSheet';
import { CarritoOrdenPanel } from '../components/ventas/CarritoOrdenPanel';
import { CatalogoPlatillos } from '../components/ventas/CatalogoPlatillos';
import { CobroModal } from '../components/ventas/CobroModal';
import { DomicilioCobroModal } from '../components/ventas/DomicilioCobroModal';
import { PlatilloRecetaModal } from '../components/ventas/PlatilloRecetaModal';
import { VentasStatusHeader } from '../components/ventas/VentasStatusHeader';

export const VentasPage: React.FC = () => {
  const canCreate = useAuthStore((s) => s.can('ventas:crear'));
  const canCreateDelivery = useAuthStore((s) => s.can('domicilios:crear'));
  const canOpenCaja = useAuthStore((s) => s.can('caja:abrir'));
  // Creación de categorías y platillos reservada exclusivamente al Administrador
  const isAdminMenu = useAuthStore((s) => s.isAdmin() && s.can('ventas:gestionar_menu'));
  const {
    items,
    tipoServicio,
    mesaId,
    nombreTurno,
    addItem,
    updateQty,
    updateNotes,
    removeItem,
    setTipoServicio,
    setMesaId,
    setNombreTurno,
    clearCart,
    getTotals,
  } = useCartStore();

  const [menu, setMenu] = useState<MenuDataModel | null>(null);
  const [ingredientes, setIngredientes] = useState<IngredienteModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | 'ESPECIAL' | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [infoPlatillo, setInfoPlatillo] = useState<PlatilloModel | null>(null);
  const [platilloModalOpen, setPlatilloModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [incluirFacturaTicket, setIncluirFacturaTicket] = useState(true);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const [ticketImprimir, setTicketImprimir] = useState<TicketImprimibleModel | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<TicketImprimibleModel | null>(null);

  // Controlado por variables de entorno (.env) para habilitar mesas y domicilio sin tocar código
  const habilitarMesas = menu ? menu.habilitarMesas && env.ENABLE_TABLE_SERVICE : env.ENABLE_TABLE_SERVICE;
  const habilitarDelivery =
    env.ENABLE_DELIVERY && canCreateDelivery && (menu ? Boolean(menu.habilitarDelivery) : true);

  const cargarMenu = useCallback(async (enSegundoPlano = false) => {
    if (!enSegundoPlano) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await ventasService.obtenerMenu();
      setMenu(data);
      const eliminados = useCartStore.getState().sincronizarConMenu(data.platillos);
      if (eliminados.length > 0) {
        const nombres = eliminados.map((item) => item.nombre).filter((n): n is string => Boolean(n));
        if (nombres.length === eliminados.length && nombres.length === 1) {
          setCartNotice(
            `Se quitó "${nombres[0]}" del pedido porque ya no está disponible en el menú actual.`,
          );
        } else if (nombres.length === eliminados.length) {
          setCartNotice(
            `Se quitaron del pedido porque ya no están disponibles: ${nombres.join(', ')}.`,
          );
        } else {
          setCartNotice(
            `Se quitaron ${eliminados.length} platillo(s) del pedido porque ya no existen o no están disponibles en el menú.`,
          );
        }
      }
      // Si el servicio en mesas o domicilio está deshabilitado actualmente, asegurar servicio en MOSTRADOR
      if (!data.habilitarMesas && useCartStore.getState().tipoServicio === 'MESA') {
        useCartStore.getState().setTipoServicio('MOSTRADOR');
      }
      if ((!env.ENABLE_DELIVERY || !data.habilitarDelivery) && useCartStore.getState().tipoServicio === 'DELIVERY') {
        useCartStore.getState().setTipoServicio('MOSTRADOR');
      }
      setSelectedCat((actual) => {
        if (actual === 'ESPECIAL') {
          return data.menuEspecialActivo?.platillosIds.length ? actual : null;
        }
        return data.categorias.some((categoria) => categoria.id === actual) ? actual : null;
      });
    } catch (err) {
      if (!enSegundoPlano) setError(err instanceof Error ? err.message : 'Error cargando el menú');
    } finally {
      if (!enSegundoPlano) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarMenu();
    const revisarVigencia = () => {
      if (document.visibilityState === 'visible') void cargarMenu(true);
    };
    const intervalo = window.setInterval(revisarVigencia, 60000);
    document.addEventListener('visibilitychange', revisarVigencia);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', revisarVigencia);
    };
  }, [cargarMenu]);

  const qtyByPlatillo = useMemo(() => {
    const map = new Map<number, number>();
    for (const i of items) map.set(i.platillo.id, i.cantidad);
    return map;
  }, [items]);

  const countByCategoria = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of menu?.platillos ?? []) {
      map.set(p.categoriaId, (map.get(p.categoriaId) ?? 0) + 1);
    }
    return map;
  }, [menu]);

  const pendientesConfigCount = useMemo(
    () => (menu?.platillos ?? []).filter((p) => !p.disponible || p.precioVenta <= 0).length,
    [menu],
  );

  const platillosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (menu?.platillos ?? []).filter((p) => {
      if (onlyAvailable && (!p.disponible || p.precioVenta <= 0)) {
        return false;
      }
      const matchCat =
        selectedCat === 'ESPECIAL'
          ? p.esEspecialHoy
          : selectedCat !== null
            ? p.categoriaId === selectedCat
            : true;
      const matchSearch = term
        ? p.nombre.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.descripcion ?? '').toLowerCase().includes(term)
        : true;
      return matchCat && matchSearch;
    });
  }, [menu, selectedCat, search, onlyAvailable]);

  const mesaSeleccionada = useMemo(
    () => (menu?.mesas ?? []).find((m) => m.id === mesaId) ?? null,
    [menu, mesaId],
  );

  const [cortesias, setCortesias] = useState<Record<number, number>>({});
  const itemsCobro = items.map((item) => ({
    ...item, cantidadCortesia: Math.min(item.cantidad, cortesias[item.platillo.id] ?? 0),
  }));
  const totals = {
    ...getTotals(),
    ...calcularIvaIncluido(itemsCobro.reduce((total, item) => total
      + (item.cantidad - item.cantidadCortesia) * item.platillo.precioVenta, 0)),
  };
  const faltantesPedido = useMemo(() => calcularFaltantesPedido(items, menu?.platillos ?? []), [items, menu]);
  const cambiarCortesia = (id: number, cantidad: number) => setCortesias((prev) => ({ ...prev, [id]: cantidad }));
  const quitarLinea = (id: number) => { cambiarCortesia(id, 0); removeItem(id); };
  const cambiarCantidad = (id: number, delta: number) => {
    const proxima = (items.find((item) => item.platillo.id === id)?.cantidad ?? 0) + delta;
    if (proxima < (cortesias[id] ?? 0)) cambiarCortesia(id, Math.max(0, proxima));
    updateQty(id, delta);
  };

  const abrirCobro = () => {
    if (habilitarMesas && tipoServicio === 'MESA' && !mesaId) {
      setError('Selecciona una mesa en el panel de la orden antes de cobrar.');
      return;
    }
    setError(null);
    setIdempotencyKey(generarUuid());
    if (habilitarDelivery && tipoServicio === 'DELIVERY') {
      setDeliveryModalOpen(true);
      return;
    }
    setCheckoutOpen(true);
  };

  const abrirNuevoPlatillo = async () => {
    setError(null);
    setSuccess(null);
    try {
      setIngredientes(await inventarioService.listarIngredientes());
    } catch {
      setIngredientes([]);
    }
    setPlatilloModalOpen(true);
  };

  const handleCrearCategoria = async (payload: NuevaCategoriaPayload): Promise<boolean> => {
    setError(null);
    try {
      await ventasService.crearCategoria(payload);
      setCatModalOpen(false);
      setSuccess(`Categoría "${payload.nombre}" creada correctamente.`);
      await cargarMenu();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría');
      return false;
    }
  };

  const handleVentaConfirmada = async (ticket: TicketImprimibleModel) => {
    clearCart();
    setCortesias({});
    setCartNotice(null);
    setIdempotencyKey('');
    setCheckoutOpen(false);
    setIncluirFacturaTicket(true);
    setUltimoTicket(ticket);
    setTicketImprimir(ticket);
    await cargarMenu();
  };

  const handlePedidoDomicilioCreado = async ({
    pedido,
    ticket,
    incluirFactura,
    advertenciasStock,
  }: {
    pedido: { numeroPedido: string; modalidadPago: string };
    ticket: TicketImprimibleModel;
    incluirFactura: boolean;
    advertenciasStock: Array<{ ingredienteNombre: string }>;
  }) => {
    clearCart();
    setCortesias({});
    setIdempotencyKey('');
    setDeliveryModalOpen(false);
    setIncluirFacturaTicket(incluirFactura);
    setSuccess(
      `Pedido a domicilio ${pedido.numeroPedido} registrado (${pedido.modalidadPago === 'PREPAGADO' ? 'Prepagado' : 'Contra entrega'}).`,
    );
    if (advertenciasStock.length > 0) {
      setCartNotice(
        `Aviso de stock bajo al crear ${pedido.numeroPedido}: ${advertenciasStock.map((a) => a.ingredienteNombre).join(', ')}.`,
      );
    } else {
      setCartNotice(null);
    }
    setUltimoTicket(ticket);
    setTicketImprimir(ticket);
    await cargarMenu();
  };

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <VentasStatusHeader
        menu={menu}
        canOpenCaja={canOpenCaja}
        ultimoTicket={ultimoTicket}
        selectedCat={selectedCat}
        onReimprimirUltimo={setTicketImprimir}
        onToggleEspecial={() => setSelectedCat(selectedCat === 'ESPECIAL' ? null : 'ESPECIAL')}
      />

      {error && <Alert type="error" message={error} />}
      {cartNotice && <Alert type="warning" message={cartNotice} />}
      {success && <Alert type="success" message={success} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <CatalogoPlatillos
          menu={menu}
          loading={loading}
          search={search}
          selectedCat={selectedCat}
          onlyAvailable={onlyAvailable}
          pendientesConfigCount={pendientesConfigCount}
          countByCategoria={countByCategoria}
          platillosFiltrados={platillosFiltrados}
          qtyByPlatillo={qtyByPlatillo}
          canCreatePlatillo={isAdminMenu}
          onSearchChange={setSearch}
          onSelectCat={setSelectedCat}
          onToggleOnlyAvailable={() => setOnlyAvailable((prev) => !prev)}
          onLimpiarFiltros={() => {
            setSearch('');
            setSelectedCat(null);
            setOnlyAvailable(false);
          }}
          onAddItem={addItem}
          onUpdateQty={cambiarCantidad}
          onVerReceta={setInfoPlatillo}
          onNuevoPlatillo={() => void abrirNuevoPlatillo()}
          onNuevaCategoria={() => setCatModalOpen(true)}
        />

        <CarritoOrdenPanel
          items={itemsCobro}
          tipoServicio={tipoServicio}
          mesaId={mesaId}
          mesaSeleccionada={mesaSeleccionada}
          mesas={menu?.mesas ?? []}
          nombreTurno={nombreTurno}
          habilitarMesas={habilitarMesas}
          habilitarDelivery={habilitarDelivery}
          totals={totals}
          canCreate={canCreate}
          canOpenCaja={canOpenCaja}
          cajaAbierta={Boolean(menu?.cajaAbierta)}
          faltantes={faltantesPedido}
          onSetTipoServicio={setTipoServicio}
          onSetMesaId={setMesaId}
          onSetNombreTurno={setNombreTurno}
          onUpdateQty={cambiarCantidad}
          onUpdateNotes={updateNotes}
          onRemoveItem={quitarLinea}
          onCortesia={cambiarCortesia}
          onClearCart={() => {
            clearCart();
            setCortesias({});
            setCartNotice(null);
          }}
          onAbrirCobro={abrirCobro}
        />
      </div>

      <CarritoMobileSheet
        open={mobileCartOpen}
        onOpen={() => setMobileCartOpen(true)}
        onClose={() => setMobileCartOpen(false)}
        items={itemsCobro}
        tipoServicio={tipoServicio}
        mesaId={mesaId}
        mesaSeleccionada={mesaSeleccionada}
        mesas={menu?.mesas ?? []}
        nombreTurno={nombreTurno}
        habilitarMesas={habilitarMesas}
        habilitarDelivery={habilitarDelivery}
        totals={totals}
        canCreate={canCreate}
        canOpenCaja={canOpenCaja}
        cajaAbierta={Boolean(menu?.cajaAbierta)}
        faltantes={faltantesPedido}
        onSetTipoServicio={setTipoServicio}
        onSetMesaId={setMesaId}
        onSetNombreTurno={setNombreTurno}
        onUpdateQty={cambiarCantidad}
        onUpdateNotes={updateNotes}
        onRemoveItem={quitarLinea}
        onCortesia={cambiarCortesia}
        onClearCart={() => {
          clearCart();
          setCortesias({});
          setCartNotice(null);
        }}
        onAbrirCobro={abrirCobro}
      />

      <PlatilloRecetaModal platillo={infoPlatillo} onClose={() => setInfoPlatillo(null)} />

      <CobroModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        idempotencyKey={idempotencyKey}
        habilitarMesas={habilitarMesas}
        tipoServicio={tipoServicio}
        mesaId={mesaId}
        mesaSeleccionada={mesaSeleccionada}
        nombreTurno={nombreTurno}
        items={itemsCobro}
        totals={totals}
        onVentaConfirmada={handleVentaConfirmada}
        onInventarioInsuficiente={() => void cargarMenu(true)}
      />

      {habilitarDelivery && (
        <DomicilioCobroModal
          open={deliveryModalOpen}
          onClose={() => setDeliveryModalOpen(false)}
          idempotencyKey={idempotencyKey}
          cajaAbierta={Boolean(menu?.cajaAbierta)}
          items={itemsCobro}
          subtotalPlatillos={totals.total}
          onPedidoCreado={handlePedidoDomicilioCreado}
        />
      )}

      <PrintTicketsModal
        ticket={ticketImprimir}
        includeFactura={incluirFacturaTicket}
        includeComanda
        includeEntrega
        autoPrint
        onClose={() => setTicketImprimir(null)}
      />

      {isAdminMenu && (
        <>
          <NuevoPlatilloModal
            open={platilloModalOpen}
            categorias={menu?.categorias ?? []}
            ingredientes={ingredientes}
            onNuevaCategoria={() => setCatModalOpen(true)}
            onClose={() => setPlatilloModalOpen(false)}
            onCreated={async (msg, avisoFoto) => {
              setSuccess(msg);
              if (avisoFoto) setError(avisoFoto);
              await cargarMenu();
            }}
          />
          <NuevaCategoriaModal
            open={catModalOpen}
            onClose={() => setCatModalOpen(false)}
            onGuardar={handleCrearCategoria}
          />
        </>
      )}
    </div>
  );
};
