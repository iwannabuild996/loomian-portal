import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { assetUrl, isImagePath, removeAssets, uploadAsset } from '../../lib/storage';
import { friendlyError, type Row } from '../admin/ResourcePage';
import type { LightboxItem } from './Lightbox';

export type FileKind = 'image' | 'brochure' | 'floor_plan';

const FOLDER: Record<FileKind, string> = { image: 'gallery', brochure: 'brochures', floor_plan: 'floor-plans' };
const MAX_MB = 20;

type Props = {
  title: string;
  kind: FileKind;
  projectId: string;
  files: Row[];
  accept: string;
  canEdit: boolean;
  onOpenImages: (items: LightboxItem[], index: number) => void;
};

export function FileSection({ title, kind, projectId, files, accept, canEdit, onOpenImages }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['project', projectId] });

  const upload = useMutation({
    mutationFn: async (list: File[]) => {
      for (const file of list) {
        if (file.size > MAX_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_MB} MB`);
        const path = await uploadAsset(`${FOLDER[kind]}/${projectId}`, file);
        const { error } = await supabase
          .from('project_files')
          .insert({ project_id: projectId, kind, path, title: file.name.replace(/\.[^.]+$/, '') });
        if (error) {
          await removeAssets([path]);
          throw error;
        }
      }
    },
    onSuccess: () => setError(null),
    onError: (e) => setError(friendlyError(e)),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: async (file: Row) => {
      const { data, error } = await supabase.from('project_files').delete().eq('id', file.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the file no longer exists.');
      await removeAssets([file.path]);
    },
    onError: (e) => setError(friendlyError(e)),
    onSettled: refresh,
  });

  const images = files.filter((f) => isImagePath(f.path));
  const docs = files.filter((f) => !isImagePath(f.path));
  const lightboxItems: LightboxItem[] = images.map((f) => ({ url: assetUrl(f.path)!, title: f.title ?? title }));

  const del = (f: Row) => {
    if (window.confirm(`Delete "${f.title ?? 'this file'}"?`)) remove.mutate(f);
  };

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title} <span className="font-normal text-slate-400">({files.length})</span></h2>
        {canEdit && (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200">
            <Plus className="size-4" /> {upload.isPending ? 'Uploading…' : 'Add files'}
            <input
              type="file"
              multiple
              accept={accept}
              className="hidden"
              disabled={upload.isPending}
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = '';
                if (list.length) upload.mutate(list);
              }}
            />
          </label>
        )}
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {files.length === 0 && <p className="text-sm text-slate-500">Nothing uploaded yet.</p>}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((f, i) => (
            <figure key={f.id} className="group relative overflow-hidden rounded-lg bg-slate-100">
              <button className="block w-full" onClick={() => onOpenImages(lightboxItems, i)} aria-label={`Open ${f.title ?? 'image'}`}>
                <img src={assetUrl(f.path)!} alt={f.title ?? ''} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </button>
              {f.title && <figcaption className="truncate px-2 py-1 text-xs text-slate-600">{f.title}</figcaption>}
              {canEdit && (
                <button
                  aria-label={`Delete ${f.title ?? 'image'}`}
                  onClick={() => del(f)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1.5 text-red-600 opacity-0 shadow group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </figure>
          ))}
        </div>
      )}

      {docs.length > 0 && (
        <ul className={`divide-y divide-slate-100 ${images.length ? 'mt-4' : ''}`}>
          {docs.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <a href={assetUrl(f.path)!} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-indigo-600 hover:underline">
                <FileText className="size-5 shrink-0" />
                <span className="truncate">{f.title ?? 'Document'}</span>
              </a>
              {canEdit && (
                <button aria-label={`Delete ${f.title ?? 'file'}`} onClick={() => del(f)} className="rounded p-1.5 text-red-600 hover:bg-red-50">
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
