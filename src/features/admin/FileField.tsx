import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { assetUrl, isImagePath } from '../../lib/storage';
import { CropDialog } from './CropDialog';

type Props = {
  accept?: string;
  maxMB?: number;
  /** Offer a crop dialog when an image is picked. */
  crop?: boolean;
  currentPath: string | null;
  /** File = new upload, null = remove the current file, undefined = unchanged */
  pending: File | null | undefined;
  onChange: (next: File | null | undefined) => void;
};

export function FileField({ accept, maxMB = 20, crop, currentPath, pending, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pending || !pending.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(pending);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pending]);

  const currentUrl = assetUrl(currentPath);
  const shownImage = previewUrl ?? (pending === undefined && currentPath && isImagePath(currentPath) ? currentUrl : null);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (crop && file.type.startsWith('image/')) {
      setError(null);
      return setCropping(file);
    }
    keepFile(file);
  };

  const keepFile = (file: File) => {
    if (file.size > maxMB * 1024 * 1024) return setError(`File is larger than ${maxMB} MB`);
    setError(null);
    onChange(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {shownImage ? (
          <img src={shownImage} alt="" className="size-16 rounded-lg border border-slate-200 bg-slate-50 object-contain" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400">
            <FileText className="size-6" />
          </div>
        )}
        <div className="min-w-0 text-sm">
          {pending ? (
            <p className="truncate font-medium">{pending.name} <span className="font-normal text-amber-600">(not saved yet)</span></p>
          ) : pending === null ? (
            <p className="text-amber-600">Will be removed when you save</p>
          ) : currentUrl ? (
            <a href={currentUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">View current file</a>
          ) : (
            <p className="text-slate-500">No file</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept={accept}
          onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
        {pending !== undefined && (
          <button type="button" onClick={() => onChange(undefined)} className="text-sm text-slate-600 hover:underline">Undo</button>
        )}
        {pending === undefined && currentPath && (
          <button type="button" onClick={() => onChange(null)} className="text-sm text-red-600 hover:underline">Remove</button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {cropping && (
        <CropDialog
          file={cropping}
          onCancel={() => setCropping(null)}
          onSkip={() => { keepFile(cropping); setCropping(null); }}
          onDone={(cropped) => { keepFile(cropped); setCropping(null); }}
        />
      )}
    </div>
  );
}
