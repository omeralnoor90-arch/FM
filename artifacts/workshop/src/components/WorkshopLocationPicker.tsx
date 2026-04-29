import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface Props {
  lat: number | null;
  lng: number | null;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const prevRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    if (!prev || (prev.lat === lat && prev.lng === lng)) {
      prevRef.current = { lat, lng };
      return;
    }
    prevRef.current = { lat, lng };
    map.flyTo([lat, lng], map.getZoom(), { duration: 0.6 });
  }, [lat, lng, map]);
  return null;
}

const DEFAULT_LAT = 24.7136;
const DEFAULT_LNG = 46.6753;

export default function WorkshopLocationPicker({ lat, lng, radius, onChange }: Props) {
  const hasPin = lat != null && lng != null;
  const centerLat = hasPin ? lat! : DEFAULT_LAT;
  const centerLng = hasPin ? lng! : DEFAULT_LNG;

  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: 360 }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={16}
        style={{ height: "100%", width: "100%", cursor: "crosshair" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        {hasPin && <RecenterMap lat={lat!} lng={lng!} />}
        {hasPin && (
          <>
            <Marker
              position={[lat!, lng!]}
              draggable
              eventHandlers={{
                dragend(e) {
                  const m = e.target as L.Marker;
                  const p = m.getLatLng();
                  onChange(p.lat, p.lng);
                },
              }}
            />
            <Circle
              center={[lat!, lng!]}
              radius={radius}
              pathOptions={{
                color: "#FF3C00",
                fillColor: "#FF3C00",
                fillOpacity: 0.12,
                weight: 2,
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}
