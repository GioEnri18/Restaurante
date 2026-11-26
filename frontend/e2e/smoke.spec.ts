import { expect, test, type Page } from '@playwright/test';

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || 'Admin123!';

/**
 * Inicia sesión en el POS usando el formulario de /login.
 */
async function iniciarSesion(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Usuario o correo electrónico', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

test.describe('Smoke E2E - POS Restaurante Guatemala', () => {
  test.beforeEach(async ({ page }) => {
    // Evitar bloqueo por diálogo nativo de impresión en pruebas headless
    await page.addInitScript(() => {
      window.print = () => {};
    });
  });

  test('Flujo 1: Login, apertura de caja, venta en efectivo y emisión de factura/comanda', async ({ page }) => {
    await iniciarSesion(page, ADMIN_USER, ADMIN_PASSWORD);

    // 1. Abrir caja si aún no existe turno abierto (esperando a que termine de cargar el estado)
    await page.goto('/caja');
    const headingApertura = page.getByRole('heading', { name: 'Iniciar Turno de Caja' });
    const botonCerrarTurno = page.getByRole('button', { name: /Cuadrar y cerrar turno/i });
    await expect(headingApertura.or(botonCerrarTurno)).toBeVisible({ timeout: 15_000 });

    if (await headingApertura.isVisible()) {
      await page.getByLabel(/Efectivo contado al abrir/).fill('250.00');
      await page.getByRole('button', { name: /Abrir caja/i }).click();
      await expect(botonCerrarTurno).toBeVisible({ timeout: 15_000 });
    }

    // 2. Ir a Ventas, agregar el primer platillo vendible y abrir el cobro
    await page.goto('/ventas');
    const botonAgregar = page.getByText('Agregar', { exact: true }).first();
    await expect(botonAgregar).toBeVisible({ timeout: 15_000 });
    await botonAgregar.click();

    const botonCobrar = page.getByRole('button', { name: /^Cobrar Q/i }).first();
    await expect(botonCobrar).toBeEnabled({ timeout: 10_000 });
    await botonCobrar.click();

    // 3. Confirmar cobro en efectivo con Pago exacto
    await page.getByRole('button', { name: 'Pago exacto' }).click();
    await page.getByRole('button', { name: 'Confirmar e Imprimir' }).click();

    // 4. Verificar modal de factura y comanda con correlativo emitido
    const modalImpresion = page.getByRole('dialog');
    await expect(modalImpresion).toBeVisible({ timeout: 15_000 });
    await expect(
      modalImpresion.getByRole('heading', { name: 'Factura y comanda de cocina' }),
    ).toBeVisible();
    await expect(modalImpresion.getByText(/[A-Z]-\d{6,}/).first()).toBeVisible();
  });

  test('Flujo 2: Pedido en portal público /pedir, seguimiento y verificación en tablero /domicilios', async ({
    page,
  }) => {
    // 1. Ingresar al portal público sin autenticación
    await page.goto('/pedir');

    // Seleccionar modalidad Para llevar para no depender de dirección ni zona específica
    const botonLlevar = page.getByRole('button', { name: /Para llevar \(Recoger/i });
    await expect(botonLlevar).toBeVisible({ timeout: 15_000 });
    await botonLlevar.click();

    // 2. Agregar primer platillo del menú público
    const botonAgregarMenu = page.getByRole('button', { name: /Agregar a mi orden/i }).first();
    await expect(botonAgregarMenu).toBeVisible({ timeout: 15_000 });
    await botonAgregarMenu.click();

    // 3. Llenar datos mínimos del cliente (teléfono único por corrida para idempotencia) y enviar
    const telefonoUnico = String(50_000_000 + (Date.now() % 49_999_999));
    await page.getByPlaceholder('Ej. María López').fill('Cliente Smoke E2E');
    await page.getByPlaceholder('5512-3456').fill(telefonoUnico);
    await page.getByRole('button', { name: /Enviar pedido para llevar/i }).click();

    // 4. Confirmar redirección a seguimiento con número LLV-...
    await expect(page).toHaveURL(/\/pedir\/seguimiento\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });
    const headingOrden = page.getByRole('heading', { name: /Orden LLV-\d+/i });
    await expect(headingOrden).toBeVisible({ timeout: 15_000 });

    const textoHeading = (await headingOrden.textContent()) ?? '';
    const matchNumero = textoHeading.match(/LLV-\d+/i);
    expect(matchNumero).not.toBeNull();
    const numeroPedido = matchNumero![0];

    // 5. Iniciar sesión en el POS y confirmar que el pedido web aparece en /domicilios
    await iniciarSesion(page, ADMIN_USER, ADMIN_PASSWORD);
    await page.goto('/domicilios');

    const tarjetaPedido = page.getByText(numeroPedido, { exact: false }).first();
    await expect(tarjetaPedido).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Pedido Web').first()).toBeVisible();
  });
});
