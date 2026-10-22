import { lazy, Suspense, useMemo, useState } from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AssetImage } from '../../components/AssetImage';
import { formatINR, parsePriceRange } from '../../lib/money';
import { formatMonthYear } from '../../lib/month';
import { PROPERTY_TYPE_LABEL, type PropertyType } from '../../lib/propertyType';
import { assetUrl } from '../../lib/storage';
import { StatusBadge } from '../../components/StatusBadge';
import { useHideStock } from '../settings/useSettings';
import { useInventory, useUpdateAvailability, type InventoryRow } from './useInventory';

/** undefined = no bound entered, null = unreadable input (ignored, shown in red). */
type Bound = number | undefined | null;

const parseSqft = (text: string): Bound => {
  const t = text.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const parseAmount = (text: string): Bound => {
  const t = text.trim();
  if (!t) return undefined;
  const r = parsePriceRange(t);
  return r && r.min === r.max ? r.min : null;
};

const InventoryMap = lazy(() => import('./InventoryMap'));

export function InventoryPage() {
  const { role } = useAuth();
  const { data = [], isLoading, error } = useInventory();
  const update = useUpdateAvailability();
  const hideStock = useHideStock();
  const canEdit = role === 'admin' || role === 'editor';

  const [view, setView] = useState<'list' | 'map'>('list');
  const [search, setSearch] = useState('');
  const [builder, setBuilder] = useState('');
  const [location, setLocation] = useState('');
  const [config, setConfig] = useState('');
  const [inStock, setInStock] = useState(false);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [sqftMin, setSqftMin] = useState('');
  const [sqftMax, setSqftMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  const bounds = {
    sqftMin: parseSqft(sqftMin), sqftMax: parseSqft(sqftMax),
    priceMin: parseAmount(priceMin), priceMax: parseAmount(priceMax),
  };
  const outside = (value: number | null, lo: Bound, hi: Bound) =>
    (lo != null || hi != null) && (value == null || (lo != null && value < lo) || (hi != null && value > hi));
  const anyFilter = !!(search || builder || location || config || kind || status || inStock || sqftMin || sqftMax || priceMin || priceMax);
  const clearFilters = () => {
    setSearch(''); setBuilder(''); setLocation(''); setConfig(''); setKind(''); setStatus(''); setInStock(false);
    setSqftMin(''); setSqftMax(''); setPriceMin(''); setPriceMax('');
  };

  const builders = useMemo(() => [...new Set(data.map((r) => r.builder).filter((b): b is string => !!b))].sort(), [data]);
  const locations = useMemo(() => [...new Set(data.map((r) => r.location))].sort(), [data]);
  const configs = useMemo(
    () => [...new Map(data.map((r) => [r.config, r.config_order])).entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name),
    [data],
  );

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = data.filter(
      (r) =>
        (!builder || r.builder === builder) &&
        (!location || r.location === location) &&
        (!config || r.config === config) &&
        (!kind || r.property_type === kind) &&
        (!status || r.status === status) &&
        !outside(r.sqft, bounds.sqftMin, bounds.sqftMax) &&
        !outside(r.price, bounds.priceMin, bounds.priceMax) &&
        (hideStock || !inStock || r.available_count > 0) &&
        (!q || `${r.project} ${r.builder ?? ''} ${r.location} ${r.usp ?? ''}`.toLowerCase().includes(q)),
    );
    const map = new Map<string, InventoryRow[]>();
    for (const r of filtered) map.set(r.project_id, [...(map.get(r.project_id) ?? []), r]);
    return [...map.values()];
  }, [data, search, builder, location, config, kind, status, inStock, hideStock, sqftMin, sqftMax, priceMin, priceMax]);

  const field =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
  const th = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
  const td = 'border-t border-slate-200 px-3 py-2.5 align-middle';

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-slate-500">
            {groups.length} project{groups.length === 1 ? '' : 's'}
            {!hideStock && ` · ${groups.reduce((n, g) => n + g.reduce((m, r) => m + r.available_count, 0), 0)} units available`}
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-200 p-0.5 text-sm">
          {([['list', 'List', List], ['map', 'Map', MapIcon]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${view === v ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className={`${field} w-full sm:w-72`}
          placeholder="Search project, builder, location, USP"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={field} value={builder} onChange={(e) => setBuilder(e.target.value)}>
          <option value="">All builders</option>
          {builders.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select className={field} value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className={field} value={config} onChange={(e) => setConfig(e.target.value)}>
          <option value="">All configs</option>
          {configs.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}
        </select>
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ready_to_move">Ready to move</option>
          <option value="off_plan">Off-plan</option>
        </select>
        {!hideStock && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-indigo-600" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
            In stock only
          </label>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">Sqft</span>
          <input className={`${field} w-24 ${bounds.sqftMin === null ? 'border-red-400' : ''}`} inputMode="numeric" placeholder="Min" value={sqftMin} onChange={(e) => setSqftMin(e.target.value)} />
          <span className="text-slate-400">to</span>
          <input className={`${field} w-24 ${bounds.sqftMax === null ? 'border-red-400' : ''}`} inputMode="numeric" placeholder="Max" value={sqftMax} onChange={(e) => setSqftMax(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">Price</span>
          <input className={`${field} w-28 ${bounds.priceMin === null ? 'border-red-400' : ''}`} placeholder="Min e.g. 50 L" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
          <span className="text-slate-400">to</span>
          <input className={`${field} w-28 ${bounds.priceMax === null ? 'border-red-400' : ''}`} placeholder="Max e.g. 1.5 Cr" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
        </div>
        {anyFilter && (
          <button onClick={clearFilters} className="text-sm text-indigo-600 hover:underline">Clear filters</button>
        )}
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {update.error && <p role="alert" className="mb-3 text-sm text-red-600">Update failed: {update.error.message}</p>}

      {view === 'map' ? (
        <Suspense fallback={<p className="text-slate-500">Loading map…</p>}>
          <InventoryMap groups={groups} hideStock={hideStock} />
        </Suspense>
      ) : (
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              {['Project', 'Location', 'Possession', 'Config', 'Type', 'Sqft', 'Available', 'Price', 'Sqft rate', 'Parking', 'Reg', 'Floor hike', 'USP'].filter((h) => !(hideStock && h === 'Available')).map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          {groups.map((rows) => {
            const p = rows[0];
            return (
              <tbody key={p.project_id} className="border-b-4 border-indigo-100 hover:bg-slate-50/60">
                {rows.map((r, i) => (
                  <tr key={r.unit_type_id}>
                    {i === 0 && (
                      <>
                        <td rowSpan={rows.length} className={td}>
                          <div className="flex items-center gap-3">
                            <AssetImage path={p.thumbnail_path} className="size-14 shrink-0 rounded-lg object-cover" />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Link to={`/projects/${p.project_id}`} className="font-semibold hover:text-indigo-600 hover:underline">{p.project}</Link>
                                <StatusBadge status={p.status} />
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <AssetImage path={p.builder_logo_path} className="h-4 max-w-10 object-contain" />
                                {p.builder ?? 'No builder'}
                              </div>
                              <div className="text-xs text-slate-400">
                                {[
                                  PROPERTY_TYPE_LABEL[p.property_type],
                                  p.total_floor_count && `${p.total_floor_count} floors`,
                                  p.total_units && `${p.total_units} units`,
                                ].filter(Boolean).join(' · ')}
                              </div>
                              {(p.floor_plan_path || p.brochure_path) && (
                                <div className="mt-1 flex gap-3 text-xs">
                                  {p.floor_plan_path && <a className="text-indigo-600 hover:underline" href={assetUrl(p.floor_plan_path)!} target="_blank" rel="noreferrer">Floor plan</a>}
                                  {p.brochure_path && <a className="text-indigo-600 hover:underline" href={assetUrl(p.brochure_path)!} target="_blank" rel="noreferrer">Brochure</a>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td rowSpan={rows.length} className={td}>{p.location}</td>
                        <td rowSpan={rows.length} className={`${td} whitespace-nowrap`}>{formatMonthYear(p.possession_date)}</td>
                      </>
                    )}
                    <td className={td}>{r.config}</td>
                    <td className={td}>Type {r.type_name}</td>
                    <td className={td}>{r.sqft ?? 'NA'}</td>
                    {!hideStock && (
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        {canEdit ? (
                          <input
                            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                            type="number"
                            min={0}
                            defaultValue={r.available_count}
                            key={r.available_count}
                            onBlur={(e) => {
                              const n = Math.max(0, Math.floor(Number(e.target.value)));
                              if (Number.isFinite(n) && n !== r.available_count) update.mutate({ id: r.unit_type_id, count: n });
                            }}
                          />
                        ) : (
                          r.available_count
                        )}
                        {r.available_count === 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Sold out</span>
                        )}
                      </div>
                    </td>
                    )}
                    <td className={`${td} whitespace-nowrap`}>{formatINR(r.price)}</td>
                    <td className={td}>{r.sqft_rate ?? 'NA'}</td>
                    {i === 0 && (
                      <>
                        <td rowSpan={rows.length} className={td}>{formatINR(p.parking_charge)}</td>
                        <td rowSpan={rows.length} className={td}>{p.registration_pct == null ? 'NA' : `${p.registration_pct}%`}</td>
                        <td rowSpan={rows.length} className={`${td} whitespace-nowrap`}>{p.floor_hike_per_floor == null ? 'NA' : `${p.floor_hike_per_floor} per floor`}</td>
                        <td rowSpan={rows.length} className={`${td} min-w-56 text-slate-600`}>{p.usp}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
        {!isLoading && groups.length === 0 && <p className="p-6 text-center text-slate-500">No matching inventory.</p>}
      </div>
      )}
    </div>
  );
}
