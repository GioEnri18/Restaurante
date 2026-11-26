import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Limpia el DOM virtual después de cada prueba para aislar estados entre casos
afterEach(() => {
  cleanup();
});

// Polyfill mínimo de scrollIntoView en jsdom (usado por PedirPublicoPage)
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
