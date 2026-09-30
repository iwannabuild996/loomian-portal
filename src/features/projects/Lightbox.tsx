import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export type LightboxItem = { url: string; title: string };

type Props = { items: LightboxItem[]; index: number; onIndex: (i: number) => void; onClose: () => void };

export function Lightbox({ items, index, onIndex, onClose }: Props) {
  const item = items[index];
  const count = items.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onIndex((index - 1 + count) % count);
      if (e.key === 'ArrowRight') onIndex((index + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndex, onClose]);

  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85" role="dialog" aria-label={item.title} onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="truncate text-sm">{item.title} · {index + 1} / {count}</span>
        <button aria-label="Close" onClick={onClose}><X className="size-6" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <img src={item.url} alt={item.title} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {count > 1 && (
          <>
            <button
              aria-label="Previous"
              className="absolute left-2 rounded-full bg-white/15 p-2 text-white hover:bg-white/30"
              onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + count) % count); }}
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              aria-label="Next"
              className="absolute right-2 rounded-full bg-white/15 p-2 text-white hover:bg-white/30"
              onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % count); }}
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
