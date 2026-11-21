import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { env } from '../../config/env';
import { MenuDataModel, PlatilloModel, TicketImprimibleModel } from '../../models';
import { ventasService } from '../../services/ventas.service';
import { useAuthStore } from '../../store/auth.store';
import { useCartStore } from '../../store/cart.store';
import { generarUuid } from '../../utils/idempotency';
import { Alert } from '../components/common/Alert';
import { PrintTicketsModal } from '../components/print/PrintTicketsModal';
import { CarritoOrdenPanel } from '../components/ventas/CarritoOrdenPanel';
import { CatalogoPlatillos } from '../components/ventas/CatalogoPlatillos';
import { CobroModal } from '../components/ventas/CobroModal';
import { PlatilloRecetaModal } from '../components/ventas/PlatilloRecetaModal';
import { VentasStatusHeader } from '../components/ventas/VentasStatusHeader';

export const VentasPage: React.FC = () => {
  const canCreate = useAuthStore((s) => s.can('ventas:crear'));
  const canOpenCaja = useAuthStore((s) => s.can('caja:abrir'));
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | 'ESPECIAL' | null>(null);
  const [infoPlatillo, setInfoPlatillo] = useState<PlatilloModel | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const [ticketImprimir, setTicketImprimir] = useState<TicketImprimibleModel | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<TicketImprimibleModel | null>(null);

  // Controlado por variables de entorno (.env) para habilitar mesas en el futuro sin tocar código
  const habilitarMesas = menu ? menu.habilitarMesas && env.ENABLE_TABLE_SERVICE : env.ENABLE_TABLE_SERVICE;

  const cargarMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ventasService.obtenerMenu();
      setMenu(data);
      // Si el servicio en mesas está deshabilitado actualmente, asegurar servicio en MOSTRADOR
      if (!data.habilitarMesas && useCartStore.getState().tipoServicio === 'MESA') {
        useCartStore.getState().setTipoServicio('MOSTRADOR');
      }
      // Si hay un menú especial marcado como principal hoy, destacarlo de entrada
      if (data.menuEspecialActivo?.esMenuPrincipal && data.menuEspecialActivo.platillosIds.length > 0) {
        setSelectedCat('ESPECIAL');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando el menú');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarMenu();
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

  const platillosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (menu?.platillos ?? []).filter((p) => {
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
  }, [menu, selectedCat, search]);

  const mesaSeleccionada = useMemo(
    () => (menu?.mesas ?? []).find((m) => m.id === mesaId) ?? null,
    [menu, mesaId],
  );

  const totals = getTotals();

  const abrirCobro = () => {
    if (habilitarMesas && tipoServicio === 'MESA' && !mesaId) {
      setError('Selecciona una mesa en el panel de la orden antes de cobrar.');
      return;
    }
    setError(null);
    setIdempotencyKey(generarUuid());
    setCheckoutOpen(true);
  };

  const handleVentaConfirmada = async (ticket: TicketImprimibleModel) => {
    clearCart();
    setIdempotencyKey('');
    setCheckoutOpen(false);
    setUltimoTicket(ticket);
    setTicketImprimir(ticket);
    await cargarMenu();
  };

  return (
    <div className="space-y-4">
      <VentasStatusHeader
        menu={menu}
        habilitarMesas={habilitarMesas}
        canOpenCaja={canOpenCaja}
        ultimoTicket={ultimoTicket}
        selectedCat={selectedCat}
        onReimprimirUltimo={setTicketImprimir}
        onToggleEspecial={() => setSelectedCat(selectedCat === 'ESPECIAL' ? null : 'ESPECIAL')}
      />

      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <CatalogoPlatillos
          menu={menu}
          loading={loading}
          search={search}
          selectedCat={selectedCat}
          countByCategoria={countByCategoria}
          platillosFiltrados={platillosFiltrados}
          qtyByPlatillo={qtyByPlatillo}
          onSearchChange={setSearch}
          onSelectCat={setSelectedCat}
          onAddItem={addItem}
          onUpdateQty={updateQty}
          onVerReceta={setInfoPlatillo}
        />

        <CarritoOrdenPanel
          items={items}
          tipoServicio={tipoServicio}
          mesaId={mesaId}
          mesaSeleccionada={mesaSeleccionada}
          mesas={menu?.mesas ?? []}
          nombreTurno={nombreTurno}
          habilitarMesas={habilitarMesas}
          totals={totals}
          canCreate={canCreate}
          cajaAbierta={Boolean(menu?.cajaAbierta)}
          onSetTipoServicio={setTipoServicio}
          onSetMesaId={setMesaId}
          onSetNombreTurno={setNombreTurno}
          onUpdateQty={updateQty}
          onUpdateNotes={updateNotes}
          onRemoveItem={removeItem}
          onClearCart={clearCart}
          onAbrirCobro={abrirCobro}
        />
      </div>

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
        items={items}
        totals={totals}
        onVentaConfirmada={handleVentaConfirmada}
      />

      <PrintTicketsModal
        ticket={ticketImprimir}
        includeComanda
        autoPrint
        onClose={() => setTicketImprimir(null)}
      />
    </div>
  );
};
