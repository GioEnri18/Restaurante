import { useState } from 'react';
import { env } from '../../../config/env';

const RUTA_FOTO = /^\/media\/platillos\/[0-9a-f-]{36}\.webp$/;

export function FotoPlatillo({ ruta, className }: { ruta: string | null; className: string }) {
  const [fallida, setFallida] = useState<string | null>(null);
  if (!ruta || !RUTA_FOTO.test(ruta) || fallida === ruta) return null;
  const api = new URL(env.API_BASE_URL, window.location.origin);
  return (
    <img
      src={new URL(ruta, api).href}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFallida(ruta)}
    />
  );
}
