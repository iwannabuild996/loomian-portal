import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { AssetImage } from '../../components/AssetImage';
import { StatusBadge } from '../../components/StatusBadge';
import { formatINR, formatPriceRange } from '../../lib/money';
import { formatMonthYear } from '../../lib/month';
import { PROPERTY_TYPE_LABEL, type PropertyType } from '../../lib/propertyType';
import { assetUrl, isImagePath, removeAssets } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { FormModal, friendlyError, type Row } from '../admin/ResourcePage';
import { useTypeFields } from '../admin/typeFields';
import { useAuth } from '../auth/AuthProvider';
import { useHideStock } from '../settings/useSettings';
import { FileSection } from './FileSection';
import { Lightbox, type LightboxItem } from './Lightbox';

const ProjectLocationMap = lazy(() => import('./ProjectLocationMap'));

const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v));
const range = (nums: number[]) => (nums.length ? (Math.min(...nums) === Math.max(...nums) ? String(nums[0]) : `${Math.min(...nums)} - ${Math.max(...nums)}`) : '—');

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const { role } = useAuth();
  const hideStock = useHideStock();
  const canEdit = role === 'admin' || role === 'editor';
  const qc = useQueryClient();
  const typeFields = useTypeFields(false);
  const [editingType, setEditingType] = useState<Row | 'new' | null>(null);
  const delType = useMutation({
    mutationFn: async (t: Row) => {
      const { data, error } = await supabase.from('unit_types').delete().eq('id', t.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the type no longer exists.');
      await removeAssets([t.layout_path]);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
  const [viewer, setViewer] = useState<{ items: LightboxItem[]; index: number } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['project', id],
    enabled: !!id,
    queryFn: async () => {
      const [project, types, files] = await Promise.all([
        supabase.from('projects').select('*, builders(name, logo_path), locations(name)').eq('id', id!).maybeSingle(),
        supabase.from('unit_types').select('*, configurations(name, sort_order)').eq('project_id', id!),
        supabase.from('project_files').select('*').eq('project_id', id!).order('sort_order').order('created_at'),
      ]);
      for (const r of [project, types, files]) if (r.error) throw r.error;
      return {
        project: project.data as Row | null,
        types: (types.data ?? []) as Row[],
        files: (files.data ?? []) as Row[],
      };
    },
  });

  const groups = useMemo(() => {
    const sorted = [...(data?.types ?? [])].sort(
      (a, b) => (a.configurations?.sort_order ?? 0) - (b.configurations?.sort_order ?? 0) || a.type_name.localeCompare(b.type_name),
    );
    const map = new Map<string, Row[]>();
    for (const t of sorted) map.set(t.configurations?.name ?? '—', [...(map.get(t.configurations?.name ?? '—') ?? []), t]);
    return [...map.entries()];
  }, [data]);

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <p role="alert" className="text-red-600">Failed to load: {error.message}</p>;
  if (!data?.project) return <p className="text-slate-500">Project not found. <Link className="text-indigo-600 underline" to="/">Back to inventory</Link></p>;

  const { project: p, types, files } = data;
  const byKind = (kind: string) => files.filter((f) => f.kind === kind);
  const sqfts = types.map((t) => t.sqft).filter((n): n is number => n != null);
  const prices = types.map((t) => t.price).filter((n): n is number => n != null);
  const available = types.reduce((n, t) => n + t.available_count, 0);
  const layoutItems: LightboxItem[] = types
    .filter((t) => t.layout_path && isImagePath(t.layout_path))
    .map((t) => ({ url: assetUrl(t.layout_path)!, title: `Type ${t.type_name} layout` }));
  const open = (items: LightboxItem[], index: number) => setViewer({ items, index });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600">
        <ArrowLeft className="size-4" /> Inventory
      </Link>

      <header className="flex flex-col gap-5 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:flex-row">
        {p.thumbnail_path && (
          <button
            className="shrink-0 self-start"
            onClick={() => open([{ url: assetUrl(p.thumbnail_path)!, title: p.name }], 0)}
            aria-label="Open thumbnail"
          >
            <AssetImage path={p.thumbnail_path} className="h-40 w-full rounded-xl object-cover sm:w-56" />
          </button>
        )}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <StatusBadge status={p.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <AssetImage path={p.builders?.logo_path} className="h-5 max-w-12 object-contain" />
              {p.builders?.name ?? 'No builder'}
            </span>
            <span>· {p.locations?.name}</span>
            <span>· {PROPERTY_TYPE_LABEL[p.property_type as PropertyType]}</span>
          </div>
          {p.usp && <p className="text-slate-700">{p.usp}</p>}
          {canEdit && (
            <Link to="/admin/projects" className="inline-block text-sm text-indigo-600 hover:underline">Edit project in admin</Link>
          )}
        </div>
      </header>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Fact label="Sqft" value={range(sqfts)} />
          <Fact label="Price (including)" value={prices.length ? formatPriceRange(Math.min(...prices), Math.max(...prices)) : '—'} />
          <Fact label="Parking" value={formatINR(p.parking_charge)} />
          <Fact label="Registration" value={p.registration_pct == null ? 'NA' : `${p.registration_pct}%`} />
          <Fact label="Floor hike" value={p.floor_hike_per_floor == null ? 'NA' : `${p.floor_hike_per_floor} per floor`} />
          <Fact label="Possession" value={formatMonthYear(p.possession_date)} />
          <Fact label="Total floors" value={dash(p.total_floor_count)} />
          <Fact label="Total units" value={dash(p.total_units)} />
          <Fact label="Types" value={String(types.length)} />
          {!hideStock && <Fact label="Available now" value={String(available)} />}
        </dl>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Types &amp; layouts</h2>
          {canEdit && (
            <button onClick={() => setEditingType('new')} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus className="size-4" /> Add type
            </button>
          )}
        </div>
        {delType.error && <p role="alert" className="mb-2 text-sm text-red-600">Delete failed: {friendlyError(delType.error)}</p>}
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">No types added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  {['Layout', 'Type', 'Sqft', 'Price', 'Sqft rate', ...(hideStock ? [] : ['Available']), ...(canEdit ? [''] : [])].map((h) => (
                    <th key={h} className="px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              {groups.map(([config, list]) => (
                <tbody key={config}>
                  <tr>
                    <th colSpan={(hideStock ? 5 : 6) + (canEdit ? 1 : 0)} className="bg-slate-100 px-3 py-1.5 text-left text-sm font-semibold">
                      {config} <span className="font-normal text-slate-500">· {list.length} type{list.length === 1 ? '' : 's'}</span>
                    </th>
                  </tr>
                  {list.map((t) => {
                    const idx = layoutItems.findIndex((l) => l.title === `Type ${t.type_name} layout`);
                    return (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          {!t.layout_path ? (
                            <span className="text-slate-400">—</span>
                          ) : isImagePath(t.layout_path) ? (
                            <button onClick={() => open(layoutItems, idx)} aria-label={`Open Type ${t.type_name} layout`}>
                              <AssetImage path={t.layout_path} className="size-14 rounded-md border border-slate-200 object-cover" />
                            </button>
                          ) : (
                            <a href={assetUrl(t.layout_path)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                              <FileText className="size-4" /> PDF
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">Type {t.type_name}</td>
                        <td className="px-3 py-2">{dash(t.sqft)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatINR(t.price)}</td>
                        <td className="px-3 py-2">{dash(t.sqft_rate)}</td>
                        {!hideStock && (
                          <td className="px-3 py-2">
                            {t.available_count}
                            {t.available_count === 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Sold out</span>}
                          </td>
                        )}
                        {canEdit && (
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <button aria-label={`Edit Type ${t.type_name}`} onClick={() => setEditingType(t)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><Pencil className="size-4" /></button>
                              <button
                                aria-label={`Delete Type ${t.type_name}`}
                                onClick={() => window.confirm(`Delete Type ${t.type_name}?`) && delType.mutate(t)}
                                className="rounded p-1.5 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>

      <FileSection title="Floor plans" kind="floor_plan" projectId={p.id} files={byKind('floor_plan')} accept="application/pdf,image/png,image/jpeg,image/webp" canEdit={canEdit} onOpenImages={open} />
      <FileSection title="Brochures" kind="brochure" projectId={p.id} files={byKind('brochure')} accept="application/pdf,image/png,image/jpeg,image/webp" canEdit={canEdit} onOpenImages={open} />
      <FileSection title="Images" kind="image" projectId={p.id} files={byKind('image')} accept="image/png,image/jpeg,image/webp" canEdit={canEdit} onOpenImages={open} />

      {p.latitude != null && p.longitude != null && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Location</h2>
            <a
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
              href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Directions <ExternalLink className="size-3.5" />
            </a>
          </div>
          <Suspense fallback={<p className="text-slate-500">Loading map…</p>}>
            <ProjectLocationMap lat={Number(p.latitude)} lng={Number(p.longitude)} />
          </Suspense>
        </section>
      )}

      {editingType && (
        <FormModal
          title={editingType === 'new' ? 'Add type' : `Edit Type ${editingType.type_name}`}
          table="unit_types"
          fields={typeFields}
          row={editingType === 'new' ? null : editingType}
          fixed={{ project_id: p.id }}
          onClose={() => setEditingType(null)}
        />
      )}

      {viewer && <Lightbox items={viewer.items} index={viewer.index} onIndex={(i) => setViewer({ ...viewer, index: i })} onClose={() => setViewer(null)} />}
    </div>
  );
}
