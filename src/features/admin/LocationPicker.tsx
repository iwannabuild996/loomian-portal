import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, type LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { field } from './ResourcePage';

const KOCHI: LatLngTuple = [9.98, 76.3];

const pin = divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#6366f1;border:3px solid #fff;box-shadow:0 0 0 2px #3730a3"></div>',
});

function parse(lat: string, lng: string): LatLngTuple | null {
  if (!lat.trim() || !lng.trim()) return null;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null;
}

function ClickToSet({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Recenters when the position changes from typing or search, but not when the user clicks the map. */
function Follow({ position, fromMap }: { position: LatLngTuple | null; fromMap: MutableRefObject<boolean> }) {
  const map = useMap();
  const lat = position?.[0];
  const lng = position?.[1];
  useEffect(() => {
    if (fromMap.current) {
      fromMap.current = false;
      return;
    }
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [map, lat, lng, fromMap]);
  return null;
}

type Props = { lat: string; lng: string; onChange: (lat: string, lng: string) => void };

export default function LocationPicker({ lat, lng, onChange }: Props) {
  const position = parse(lat, lng);
  const fromMap = useRef(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const set = (la: number, lo: number, viaMap: boolean) => {
    fromMap.current = viaMap;
    onChange(la.toFixed(6), lo.toFixed(6));
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setStatus('Searching…');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
      const results: { lat: string; lon: string; display_name: string }[] = await res.json();
      if (!results.length) return setStatus('No match found. Try a nearby landmark, or click the map.');
      set(Number(results[0].lat), Number(results[0].lon), false);
      setStatus(results[0].display_name);
    } catch {
      setStatus('Search failed. Click the map instead.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={field}
          placeholder="Search a place, e.g. Infopark Kakkanad"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" onClick={search} className="rounded-lg bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700">
          Search
        </button>
      </div>
      {/* isolate: keeps Leaflet's internal z-indexes inside the dialog */}
      <div className="isolate overflow-hidden rounded-lg ring-1 ring-slate-300">
        <MapContainer center={position ?? KOCHI} zoom={position ? 15 : 11} scrollWheelZoom={false} className="h-64 w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToSet onPick={(la, lo) => set(la, lo, true)} />
          <Follow position={position} fromMap={fromMap} />
          {position && (
            <Marker
              position={position}
              icon={pin}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng();
                  set(ll.lat, ll.lng, true);
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="flex items-start justify-between gap-3 text-xs text-slate-500">
        <span className="line-clamp-2">{status ?? 'Click the map or drag the pin to set the location.'}</span>
        {position && (
          <button type="button" onClick={() => { setStatus(null); onChange('', ''); }} className="shrink-0 text-red-600 hover:underline">
            Clear pin
          </button>
        )}
      </p>
    </div>
  );
}
