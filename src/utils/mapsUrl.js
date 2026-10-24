// Backend/src/utils/mapsUrl.js

/**
 * Validates coordinate pair.
 * Must be finite numbers within standard lat/long limits and not (0, 0).
 */
function isValidCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return false;
  if (numLat === 0 && numLng === 0) return false;
  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) return false;
  return true;
}

/**
 * Constructs outbound Google Maps search URL without paid Maps API key.
 * Uses exact coordinate query if coordinates are valid;
 * otherwise falls back to URL-encoded address if non-empty;
 * returns null if neither is available.
 */
function generateMapsUrl(location) {
  if (!location) return null;

  let lat = null;
  let lng = null;

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    // GeoJSON: [longitude, latitude]
    lng = location.coordinates[0];
    lat = location.coordinates[1];
  } else if (location.lat !== undefined && location.lng !== undefined) {
    lat = location.lat;
    lng = location.lng;
  } else if (location.latitude !== undefined && location.longitude !== undefined) {
    lat = location.latitude;
    lng = location.longitude;
  }

  if (isValidCoordinates(lat, lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`;
  }

  const address = typeof location === 'string' ? location : location.address;
  if (address && typeof address === 'string' && address.trim().length > 0) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }

  return null;
}

module.exports = {
  isValidCoordinates,
  generateMapsUrl,
};
