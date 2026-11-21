export function SelectorFotoPlatillo({
  onChange, disabled,
}: {
  onChange: (archivo: File | null) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm font-semibold text-slate-700">
      <span>Foto del platillo</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="block w-full rounded-xl border border-slate-300 p-2 text-sm"
      />
      <span className="block text-xs font-normal text-slate-500">
        JPG, PNG o WebP de hasta 5 MB. Se guarda como miniatura WebP de hasta 10 KB.
      </span>
    </label>
  );
}
