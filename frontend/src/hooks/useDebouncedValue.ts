import { useEffect, useState } from 'react';

/**
 * Retrasa la propagación de un valor que cambia con frecuencia (p. ej. filtros de texto)
 * para evitar disparos excesivos de peticiones HTTP.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
