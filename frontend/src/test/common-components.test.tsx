import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Alert } from '../ui/components/common/Alert';
import { Field } from '../ui/components/common/Field';
import { Modal } from '../ui/components/common/Modal';
import { Pagination } from '../ui/components/common/Pagination';

describe('Componentes comunes accesibles (Field, Modal, Alert, Pagination)', () => {
  it('Field vincula <label> con el input, propaga aria-invalid y muestra error con role="alert"', () => {
    render(
      <Field label="Teléfono" hint="8 dígitos" error="Teléfono inválido" required>
        <input type="tel" />
      </Field>,
    );

    const input = screen.getByLabelText('Teléfono');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    expect(screen.getByRole('alert')).toHaveTextContent('Teléfono inválido');
    expect(screen.getByText('8 dígitos')).toBeInTheDocument();
  });

  it('Alert usa role="alert" en error/warning y role="status" en success/info', () => {
    const { rerender } = render(<Alert type="error" message="Fallo de red" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Fallo de red');

    rerender(<Alert type="success" message="Venta guardada" />);
    expect(screen.getByRole('status')).toHaveTextContent('Venta guardada');
  });

  it('Modal renderiza role="dialog", aria-modal y cierra al presionar Escape o botón cerrar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal open title="Confirmar cierre" onClose={onClose}>
        <p>Contenido del diálogo</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Confirmar cierre' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Pagination deshabilita límites correctamente y dispara onPageChange', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination
        meta={{ page: 1, limit: 15, total: 40, totalPages: 3 }}
        onPageChange={onPageChange}
      />,
    );

    const prev = screen.getByRole('button', { name: 'Página anterior' });
    const next = screen.getByRole('button', { name: 'Página siguiente' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    await user.click(next);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
