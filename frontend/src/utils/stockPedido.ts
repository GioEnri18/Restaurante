import { CartItemModel, PlatilloModel } from '../models';

export interface FaltanteStock {
  ingrediente: string;
  requeridoOz: number;
  disponibleOz: number;
}

const redondearOz = (valor: number) => Math.round((valor + Number.EPSILON) * 10_000) / 10_000;

export function calcularFaltantesPedido(items: CartItemModel[], catalogo: PlatilloModel[]): FaltanteStock[] {
  const porPlatillo = new Map(catalogo.map((platillo) => [platillo.id, platillo]));
  const consumo = new Map<number, FaltanteStock>();
  for (const item of items) {
    const platillo = porPlatillo.get(item.platillo.id) ?? item.platillo;
    for (const linea of platillo.receta) {
      const acumulado = consumo.get(linea.ingredienteId);
      const requeridoOz = redondearOz(linea.cantidadOz * item.cantidad);
      consumo.set(linea.ingredienteId, {
        ingrediente: linea.ingredienteNombre || `Ingrediente #${linea.ingredienteId}`,
        requeridoOz: redondearOz((acumulado?.requeridoOz ?? 0) + requeridoOz),
        disponibleOz: Math.min(acumulado?.disponibleOz ?? linea.stockActualOz, linea.stockActualOz),
      });
    }
  }
  return [...consumo.values()].filter(({ requeridoOz, disponibleOz }) => requeridoOz > disponibleOz);
}

export function leerFaltantesPedido(details: unknown): FaltanteStock[] {
  if (!details || typeof details !== 'object' || !('faltantes' in details) || !Array.isArray(details.faltantes)) {
    return [];
  }
  return details.faltantes.filter((dato): dato is FaltanteStock =>
    dato && typeof dato.ingrediente === 'string'
    && typeof dato.requeridoOz === 'number' && Number.isFinite(dato.requeridoOz)
    && typeof dato.disponibleOz === 'number' && Number.isFinite(dato.disponibleOz));
}
