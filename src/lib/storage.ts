import { supabase } from './supabase';

export const ASSET_BUCKET = 'project-assets';

export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

export const isImagePath = (path: string) => /\.(png|jpe?g|webp)$/i.test(path);

export const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

/** Best-effort cleanup: a failed delete only leaves an unused file behind. */
export async function removeAssets(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  try {
    await supabase.storage.from(ASSET_BUCKET).remove(list);
  } catch {
    /* ignore */
  }
}

/** Uploads a file under `folder/` with a unique name and returns its storage path. */
export async function uploadAsset(folder: string, file: File): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
