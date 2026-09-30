import { assetUrl } from '../lib/storage';

export function AssetImage({ path, className, alt = '' }: { path: string | null | undefined; className?: string; alt?: string }) {
  const url = assetUrl(path);
  if (!url) return null;
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
