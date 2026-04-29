import { useEffect, useRef, useState } from "react";
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

function LocateMeButton({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  function locate() {
    if (!navigator.geolocation) return;
    setLoading(true);
    setError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        onChange(latitude, longitude);
        map.flyTo([latitude, longitude], 17, { duration: 1 });
        setLoading(false);
      },
      () => {
        setLoading(false);
        setError(true);
        setTimeout(() => setError(false), 3000);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <button
      onClick={locate}
      title={error ? "Location access denied" : "Go to my location"}
      style={{
        position: "absolute",
        bottom: 24,
        right: 12,
        zIndex: 1000,
        background: error ? "#ef4444" : "#fff",
        border: "2px solid rgba(0,0,0,0.2)",
        borderRadius: 8,
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
        transition: "background 0.2s",
      }}
    >
      {loading ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={error ? "#fff" : "#333"} strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={error ? "#fff" : "#333"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="8" strokeDasharray="4 4" strokeOpacity="0.4" />
        </svg>
      )}
    </button>
  );
}

const DEFAULT_LAT = 24.7136;
const DEFAULT_LNG = 46.6753;

export default function WorkshopLocationPicker({ lat, lng, radius, onChange }: Props) {
  const hasPin = lat != null && lng != null;
  const centerLat = hasPin ? lat! : DEFAULT_LAT;
  const centerLng = hasPin ? lng! : DEFAULT_LNG;

  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: 360, position: "relative" }}>
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
        <LocateMeButton onChange={onChange} />
      </MapContainer>

      {/* Hint overlay when no pin is set */}
      {!hasPin && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            pointerEvents: "none",
            zIndex: 1000,
            whiteSpace: "nowrap",
          }}
        >
          Click the map to place the workshop pin
        </div>
      )}
    </div>
  );
}
