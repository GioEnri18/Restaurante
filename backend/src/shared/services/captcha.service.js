const { env } = require('../../config/env');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let fetchOverride = null;

/**
 * Permite inyectar una implementación de `fetch` en pruebas automatizadas
 * para simular respuestas de Cloudflare (válida, inválida, error HTTP, timeout o caída)
 * sin salir a la red externa.
 */
function setCaptchaFetchImpl(fn) {
  fetchOverride = typeof fn === 'function' ? fn : null;
}

/**
 * Proveedores soportados detrás de la interfaz abstracta de verificación anti-bot.
 * Todos devuelven `{ ok: boolean, provider: string, reason?: string, errorCodes?: string[] }`.
 */
const PROVEEDORES_CAPTCHA = {
  /** Modo desactivado: conserva el comportamiento actual sin verificación externa */
  async none() {
    return { ok: true, provider: 'none' };
  },

  /**
   * Cloudflare Turnstile con política FAIL-CLOSED:
   * - Rechaza si falta la llave secreta configurada o el token del cliente.
   * - Rechaza si Cloudflare responde error HTTP, JSON inválido, timeout o fallo de red.
   */
  async turnstile({ token, ip, secretKey, timeoutMs, fetchImpl }) {
    if (!secretKey || !String(secretKey).trim()) {
      return {
        ok: false,
        provider: 'turnstile',
        reason: 'CAPTCHA_NOT_CONFIGURED',
      };
    }

    const tokenLimpio = typeof token === 'string' ? token.trim() : '';
    if (!tokenLimpio) {
      return {
        ok: false,
        provider: 'turnstile',
        reason: 'CAPTCHA_TOKEN_MISSING',
      };
    }

    const ejecutorFetch = fetchImpl || fetchOverride || globalThis.fetch;
    if (typeof ejecutorFetch !== 'function') {
      return {
        ok: false,
        provider: 'turnstile',
        reason: 'CAPTCHA_PROVIDER_UNAVAILABLE',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const formBody = new URLSearchParams();
      formBody.set('secret', String(secretKey).trim());
      formBody.set('response', tokenLimpio);
      if (ip && typeof ip === 'string' && ip.trim()) {
        formBody.set('remoteip', ip.trim());
      }

      const response = await ejecutorFetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formBody.toString(),
        signal: controller.signal,
      });

      if (!response || !response.ok) {
        return {
          ok: false,
          provider: 'turnstile',
          reason: 'CAPTCHA_PROVIDER_HTTP_ERROR',
        };
      }

      const payload = await response.json();
      if (payload && payload.success === true) {
        return { ok: true, provider: 'turnstile' };
      }

      return {
        ok: false,
        provider: 'turnstile',
        reason: 'CAPTCHA_INVALID',
        errorCodes: Array.isArray(payload?.['error-codes']) ? payload['error-codes'] : [],
      };
    } catch (error) {
      const esTimeout = error?.name === 'AbortError';
      return {
        ok: false,
        provider: 'turnstile',
        reason: esTimeout ? 'CAPTCHA_PROVIDER_TIMEOUT' : 'CAPTCHA_PROVIDER_ERROR',
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * Verifica el token anti-bot contra el proveedor configurado (`none` | `turnstile`).
 * Ante un proveedor desconocido falla cerrado por seguridad.
 */
async function verificarCaptcha(opciones = {}) {
  const provider = String(opciones.provider ?? env.PUBLIC_ORDERS_CAPTCHA_PROVIDER ?? 'none')
    .trim()
    .toLowerCase();
  const verificador = PROVEEDORES_CAPTCHA[provider];

  if (!verificador) {
    return {
      ok: false,
      provider,
      reason: 'CAPTCHA_PROVIDER_UNKNOWN',
    };
  }

  return verificador({
    token: opciones.token,
    ip: opciones.ip,
    secretKey: opciones.secretKey ?? env.TURNSTILE_SECRET_KEY,
    timeoutMs: opciones.timeoutMs ?? env.PUBLIC_ORDERS_CAPTCHA_TIMEOUT_MS,
    fetchImpl: opciones.fetchImpl,
  });
}

module.exports = {
  TURNSTILE_VERIFY_URL,
  verificarCaptcha,
  setCaptchaFetchImpl,
};
