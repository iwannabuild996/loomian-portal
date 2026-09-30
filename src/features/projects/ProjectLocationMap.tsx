import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function ProjectLocationMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="isolate overflow-hidden rounded-xl ring-1 ring-slate-200">
      <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} className="h-64 w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker center={[lat, lng]} radius={11} pathOptions={{ color: '#3730a3', fillColor: '#6366f1', fillOpacity: 0.85, weight: 2 }} />
      </MapContainer>
    </div>
  );
}
