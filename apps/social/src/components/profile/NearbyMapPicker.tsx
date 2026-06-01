import { useMemo, useRef } from "react";
import { decodeGeohash, encodeGeohash, NEARBY_GEOHASH_PRECISION } from "@envoymesh/api";
import { mapCenterForCountry } from "../../lib/gazetteer.js";

const FALLBACK_CENTER = { lat: 20, lng: 0 };
const MAP_SPAN_DEG = 0.08;

interface NearbyMapPickerProps {
  countryCode: string;
  geohash: string;
  onGeohashChange: (geohash: string) => void;
  pickOnMapLabel: string;
  mapHint: string;
}

export function NearbyMapPicker({
  countryCode,
  geohash,
  onGeohashChange,
  pickOnMapLabel,
  mapHint,
}: NearbyMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);

  const countryCenter = useMemo(
    () => mapCenterForCountry(countryCode) ?? FALLBACK_CENTER,
    [countryCode],
  );

  const center = useMemo(() => {
    if (geohash.trim()) {
      try {
        return decodeGeohash(geohash);
      } catch {
        return countryCenter;
      }
    }
    return countryCenter;
  }, [geohash, countryCenter]);

  const marker = useMemo(() => {
    if (!geohash.trim()) return null;
    try {
      return decodeGeohash(geohash);
    } catch {
      return null;
    }
  }, [geohash]);

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = mapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const lng = center.lng + (x - 0.5) * MAP_SPAN_DEG * 2;
    const lat = center.lat - (y - 0.5) * MAP_SPAN_DEG * 2;
    onGeohashChange(encodeGeohash(lat, lng, NEARBY_GEOHASH_PRECISION));
  };

  const markerStyle = marker
    ? {
        left: `${50 + ((marker.lng - center.lng) / (MAP_SPAN_DEG * 2)) * 100}%`,
        top: `${50 - ((marker.lat - center.lat) / (MAP_SPAN_DEG * 2)) * 100}%`,
      }
    : null;

  if (!countryCode.trim()) {
    return null;
  }

  return (
    <div className="nearby-map-picker">
      <p className="muted small">{mapHint}</p>
      <div
        ref={mapRef}
        className="nearby-map-grid"
        role="button"
        tabIndex={0}
        aria-label={pickOnMapLabel}
        onClick={handleMapClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onGeohashChange(encodeGeohash(center.lat, center.lng, NEARBY_GEOHASH_PRECISION));
          }
        }}
      >
        {markerStyle ? (
          <span className="nearby-map-marker" style={markerStyle} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
