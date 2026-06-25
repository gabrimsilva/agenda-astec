/**
 * Parse Google Maps URL to extract coordinates and address information
 * Supports various Google Maps URL formats:
 * - https://maps.google.com/?q=LAT,LNG
 * - https://www.google.com/maps/place/ADDRESS/@LAT,LNG
 * - https://www.google.com/maps/@LAT,LNG,ZOOMz
 */

interface ParsedMapLocation {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  placeId: string | null;
  zoom: number | null;
}

export function parseGoogleMapsUrl(url: string): ParsedMapLocation {
  const result: ParsedMapLocation = {
    latitude: null,
    longitude: null,
    address: null,
    placeId: null,
    zoom: null,
  };

  try {
    const urlObj = new URL(url);

    // Extract coordinates from various URL patterns
    const patterns = [
      // Pattern 1: @lat,lng,zoom format
      /@(-?\d+\.\d+),(-?\d+\.\d+),(\d+\.?\d*)z/,
      // Pattern 2: ?q=lat,lng format
      /q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      // Pattern 3: /maps/place/.../@lat,lng format
      /place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
      // Pattern 4: ll= parameter
      /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        result.latitude = parseFloat(match[1]);
        result.longitude = parseFloat(match[2]);
        if (match[3]) {
          result.zoom = parseFloat(match[3]);
        }
        break;
      }
    }

    // Extract place name/address from URL
    const placeMatch = url.match(/place\/([^/@]+)/);
    if (placeMatch) {
      result.address = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }

    // Extract place ID
    const placeIdMatch = url.match(/place\/[^/]+\/([^/]+)/);
    if (placeIdMatch) {
      result.placeId = placeIdMatch[1];
    }

    return result;
  } catch (error) {
    console.error("Error parsing Google Maps URL:", error);
    return result;
  }
}

/**
 * Reverse geocode coordinates to get address (simplified - in production use Google Maps API)
 */
export function reverseGeocode(lat: number, lng: number): Promise<string> {
  // In production, you would call Google Maps Geocoding API here
  // For now, return a placeholder
  return Promise.resolve(`Location at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
}

/**
 * Validate coordinates
 */
export function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !isNaN(lat) &&
    !isNaN(lng)
  );
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
