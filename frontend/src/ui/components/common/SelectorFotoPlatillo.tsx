import { Field } from './Field';

export function SelectorFotoPlatillo({
  onChange,
  disabled,
}: {
  onChange: (archivo: File | null) => void;
  disabled: boolean;
}) {
  return (
    <Field
      label="Foto del platillo"
      labelClassName="mb-1 block text-sm font-semibold text-slate-700"
      hint="JPG, PNG o WebP de hasta 5 MB. Se guarda como miniatura WebP de hasta 10 KB."
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="block w-full rounded-xl border border-slate-300 p-2 text-sm"
      />
    </Field>
  );
}
