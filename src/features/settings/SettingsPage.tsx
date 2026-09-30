import { useSettings } from './useSettings';

export function SettingsPage() {
  const { query, save } = useSettings();
  const hideStock = query.data?.hide_stock ?? false;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mb-6 text-sm text-slate-500">These settings apply to your account only.</p>

      <div className="flex items-start justify-between gap-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <h2 className="font-medium">Hide stock</h2>
          <p className="mt-1 text-sm text-slate-500">
            Hides available counts, "Sold out" labels and the in-stock filter on the Inventory page. Turn this on before
            sharing your screen with clients.
          </p>
          <p role="status" className="mt-2 h-5 text-xs">
            {save.isPending && <span className="text-slate-500">Saving…</span>}
            {save.isSuccess && !save.isPending && <span className="text-green-600">Saved</span>}
            {save.isError && <span className="text-red-600">Could not save: {save.error.message}</span>}
            {query.isError && <span className="text-red-600">Could not load settings: {query.error.message}</span>}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={hideStock}
          aria-label="Hide stock"
          disabled={query.isPending || save.isPending}
          onClick={() => save.mutate({ hide_stock: !hideStock })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${hideStock ? 'bg-indigo-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${hideStock ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    </div>
  );
}
