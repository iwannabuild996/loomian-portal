import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { centerCrop, convertToPixelCrop, makeAspectCrop, type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

type Props = {
  file: File;
  /** Receives the cropped image (PNG, so transparent logos stay transparent). */
  onDone: (cropped: File) => void;
  /** Use the picked file as it is. */
  onSkip: () => void;
  onCancel: () => void;
};

const ASPECTS: { label: string; value: number | undefined }[] = [
  { label: 'Free', value: undefined },
  { label: 'Square', value: 1 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
];

function initialCrop(width: number, height: number, aspect: number | undefined): Crop {
  if (!aspect) return { unit: '%', x: 5, y: 5, width: 90, height: 90 };
  return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height), width, height);
}

export function CropDialog({ file, onDone, onSkip, onCancel }: Props) {
  // Created inside the effect (not useMemo): under StrictMode the cleanup runs once before the real
  // mount, and a URL made during render would already be revoked by then.
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const img = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(initialCrop(width, height, aspect));
  };

  const pickAspect = (value: number | undefined) => {
    setAspect(value);
    if (img.current) setCrop(initialCrop(img.current.width, img.current.height, value));
  };

  const apply = () => {
    const el = img.current;
    if (!el || !crop) return;
    const px = convertToPixelCrop(crop, el.width, el.height);
    if (px.width < 1 || px.height < 1) return setError('Select an area to keep.');
    const scaleX = el.naturalWidth / el.width;
    const scaleY = el.naturalHeight / el.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(px.width * scaleX);
    canvas.height = Math.round(px.height * scaleY);
    canvas.getContext('2d')!.drawImage(el, px.x * scaleX, px.y * scaleY, px.width * scaleX, px.height * scaleY, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return setError('Could not crop this image.');
      onDone(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  // Portal: this dialog opens from inside a <form>, and must not submit or nest in it.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Crop image">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-4 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Crop image</h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-sm">
            {ASPECTS.map((a) => (
              <button
                key={a.label}
                type="button"
                aria-pressed={aspect === a.value}
                onClick={() => pickAspect(a.value)}
                className={`rounded-md px-3 py-1 font-medium ${aspect === a.value ? 'bg-white shadow-sm' : 'text-slate-600'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto rounded-lg bg-slate-100 p-2">
          <ReactCrop crop={crop} aspect={aspect} onChange={(_, percent) => setCrop(percent)} keepSelection>
            {url ? <img ref={img} src={url} alt="To crop" onLoad={onLoad} style={{ maxHeight: '60vh' }} /> : <span className="p-8 text-sm text-slate-500">Loading…</span>}
          </ReactCrop>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={onSkip} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">Use original</button>
          <button type="button" onClick={apply} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Crop &amp; use
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
