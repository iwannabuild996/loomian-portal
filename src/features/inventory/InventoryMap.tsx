import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { latLngBounds, type LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AssetImage } from '../../components/AssetImage';
import { formatPriceRange } from '../../lib/money';
import { PROPERTY_TYPE_LABEL } from '../../lib/propertyType';
import { assetUrl } from '../../lib/storage';
import { StatusBadge } from '../../components/StatusBadge';
import type { InventoryRow } from './useInventory';

const KOCHI: LatLngTuple = [9.98, 76.3];

function FitBounds({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);
  return null;
}

/** One line per configuration: sqft and price ranges across that configuration's types. */
function configSummary(rows: InventoryRow[]) {
  const byConfig = new Map<string, InventoryRow[]>();
  for (const r of rows) byConfig.set(r.config, [...(byConfig.get(r.config) ?? []), r]);
  return [...byConfig.entries()].map(([config, list]) => {
    const sqft = list.map((r) => r.sqft).filter((n): n is number => n != null);
    const prices = list.map((r) => r.price).filter((n): n is number => n != null);
    return {
      config,
      sqft: sqft.length ? (Math.min(...sqft) === Math.max(...sqft) ? `${sqft[0]}` : `${Math.min(...sqft)} - ${Math.max(...sqft)}`) : null,
      price: prices.length ? formatPriceRange(Math.min(...prices), Math.max(...prices)) : null,
      available: list.reduce((n, r) => n + r.available_count, 0),
    };
  });
}

export default function InventoryMap({ groups, hideStock }: { groups: InventoryRow[][]; hideStock: boolean }) {
  const placed = useMemo(() => groups.filter((g) => g[0].latitude != null && g[0].longitude != null), [groups]);
  const points = useMemo(() => placed.map((g): LatLngTuple => [Number(g[0].latitude), Number(g[0].longitude)]), [placed]);
  const missing = groups.length - placed.length;

  return (
    <div>
      {missing > 0 && (
        <p className="mb-2 text-sm text-amber-700">
          {missing} project{missing === 1 ? ' has' : 's have'} no coordinates and {missing === 1 ? 'is' : 'are'} not on the map. Add
          latitude and longitude on the Projects admin page.
        </p>
      )}
      {/* isolate: keeps Leaflet's internal z-indexes below the sidebar and dialogs */}
      <div className="isolate overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200">
        <MapContainer center={KOCHI} zoom={11} scrollWheelZoom className="h-[70vh] w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {placed.map((rows, i) => {
            const p = rows[0];
            return (
              <CircleMarker
                key={p.project_id}
                center={points[i]}
                radius={11}
                pathOptions={{ color: '#3730a3', fillColor: '#6366f1', fillOpacity: 0.85, weight: 2 }}
              >
                <Popup>
                  <div className="text-sm">
                    <AssetImage path={p.thumbnail_path} className="mb-2 h-24 w-full rounded object-cover" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.project}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="text-slate-500">
                      {[p.builder, p.location, PROPERTY_TYPE_LABEL[p.property_type]].filter(Boolean).join(' · ')}
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {configSummary(rows).map((c) => (
                        <li key={c.config}>
                          <strong>{c.config}</strong>
                          {c.sqft && ` · ${c.sqft} sqft`}
                          {c.price && ` · ${c.price}`}
                          {!hideStock && ` · ${c.available} available`}
                        </li>
                      ))}
                    </ul>
                    <Link className="mr-3 mt-2 inline-block text-indigo-600 underline" to={`/projects/${p.project_id}`}>
                      Details
                    </Link>
                    {p.brochure_path && (
                      <a className="mr-3 mt-2 inline-block text-indigo-600 underline" href={assetUrl(p.brochure_path)!} target="_blank" rel="noreferrer">
                        Brochure
                      </a>
                    )}
                    <a
                      className="mt-2 inline-block text-indigo-600 underline"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
