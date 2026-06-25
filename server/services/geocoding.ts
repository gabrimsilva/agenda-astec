import { z } from "zod";

// Mapbox API configuration (primary service)
const MAPBOX_BASE_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

// Nominatim API configuration (fallback service)
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "ASTEC-Renner/1.0 (renner@astec.com)";
const NOMINATIM_RATE_LIMIT_MS = 1000; // 1 request per second for Nominatim

// Rate limiting for Nominatim fallback
let lastNominatimRequestTime = 0;

async function waitForNominatimRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastNominatimRequestTime;
  
  if (timeSinceLastRequest < NOMINATIM_RATE_LIMIT_MS) {
    const waitTime = NOMINATIM_RATE_LIMIT_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastNominatimRequestTime = Date.now();
}

// Mapbox response schema
const MapboxFeatureSchema = z.object({
  id: z.string(),
  type: z.literal("Feature"),
  place_type: z.array(z.string()),
  relevance: z.number(),
  text: z.string(),
  place_name: z.string(),
  center: z.tuple([z.number(), z.number()]), // [longitude, latitude]
  context: z.array(z.object({
    id: z.string(),
    text: z.string(),
    short_code: z.string().optional(),
  })).optional(),
});

const MapboxResponseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(MapboxFeatureSchema),
});

// Nominatim response schema
const NominatimResponseSchema = z.array(z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  importance: z.number().optional(),
  place_id: z.number(),
  address: z.object({
    road: z.string().optional(),
    pedestrian: z.string().optional(),
    footway: z.string().optional(),
    house_number: z.string().optional(),
    suburb: z.string().optional(),
    neighbourhood: z.string().optional(),
    quarter: z.string().optional(),
    city_district: z.string().optional(),
    district: z.string().optional(),
    borough: z.string().optional(),
    city: z.string().optional(),
    municipality: z.string().optional(),
    town: z.string().optional(),
    village: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    state_district: z.string().optional(),
    region: z.string().optional(),
    postcode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
}));

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  found: boolean;
  address?: string;
  numero?: string;
  bairro?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  source?: "mapbox" | "nominatim";
}

/**
 * Try geocoding with Mapbox (fast, accurate, 100k free/month)
 */
async function tryMapboxGeocode(query: string): Promise<GeocodeResult | null> {
  if (!MAPBOX_ACCESS_TOKEN) {
    console.log("[Mapbox] No access token configured, skipping");
    return null;
  }

  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `${MAPBOX_BASE_URL}/${encodedQuery}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=BR&language=pt&limit=1`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.log(`[Mapbox] HTTP ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const parsed = MapboxResponseSchema.safeParse(data);
    
    if (!parsed.success || parsed.data.features.length === 0) {
      return null;
    }

    const feature = parsed.data.features[0];
    const [longitude, latitude] = feature.center;
    
    // Extract address components from context
    let city: string | undefined;
    let state: string | undefined;
    let postcode: string | undefined;
    let bairro: string | undefined;
    
    if (feature.context) {
      for (const ctx of feature.context) {
        if (ctx.id.startsWith("place.")) {
          city = ctx.text;
        } else if (ctx.id.startsWith("region.")) {
          state = ctx.text;
        } else if (ctx.id.startsWith("postcode.")) {
          postcode = ctx.text;
        } else if (ctx.id.startsWith("neighborhood.") || ctx.id.startsWith("locality.")) {
          bairro = ctx.text;
        }
      }
    }

    console.log(`[Mapbox] ✓ Found: ${feature.place_name}`);
    
    return {
      latitude,
      longitude,
      displayName: feature.place_name,
      found: true,
      city,
      state,
      postcode,
      bairro,
      country: "Brasil",
      source: "mapbox",
    };
  } catch (error) {
    console.error("[Mapbox] Error:", error);
    return null;
  }
}

/**
 * Try geocoding with Nominatim (fallback, slower but free)
 */
async function tryNominatimGeocode(query: string): Promise<GeocodeResult | null> {
  await waitForNominatimRateLimit();
  
  try {
    const url = new URL(`${NOMINATIM_BASE_URL}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const results = NominatimResponseSchema.parse(data);

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    const addressDetails = result.address;
    
    const city = addressDetails?.city || 
                 addressDetails?.municipality || 
                 addressDetails?.town || 
                 addressDetails?.village || 
                 addressDetails?.county || 
                 undefined;
    
    const bairro = addressDetails?.suburb || 
                   addressDetails?.neighbourhood || 
                   addressDetails?.quarter ||
                   addressDetails?.city_district ||
                   addressDetails?.district ||
                   addressDetails?.borough ||
                   undefined;
    
    const roadName = addressDetails?.road || 
                     addressDetails?.pedestrian || 
                     addressDetails?.footway ||
                     undefined;
    
    const stateName = addressDetails?.state || 
                      addressDetails?.state_district || 
                      addressDetails?.region ||
                      undefined;
    
    console.log(`[Nominatim] ✓ Found: ${result.display_name}`);
    
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name,
      found: true,
      address: roadName,
      numero: addressDetails?.house_number,
      bairro,
      city,
      state: stateName,
      postcode: addressDetails?.postcode,
      country: addressDetails?.country,
      source: "nominatim",
    };
  } catch (error) {
    return null;
  }
}

/**
 * Build geocoding queries with different levels of detail
 */
function buildQueries(
  address: string,
  numero?: string,
  bairro?: string,
  city?: string,
  state?: string,
  country?: string
): string[] {
  // Clean city field
  let cleanCity = city;
  if (cleanCity) {
    cleanCity = cleanCity.split(',')[0].trim();
  }

  const queries: string[] = [];

  // Query 1: Full address
  const fullParts = [];
  if (address) {
    fullParts.push(numero ? `${address}, ${numero}` : address);
  }
  if (bairro) fullParts.push(bairro);
  if (cleanCity) fullParts.push(cleanCity);
  if (state) fullParts.push(state);
  if (country) fullParts.push(country);
  if (fullParts.length > 0) {
    queries.push(fullParts.join(", "));
  }

  // Query 2: Without bairro
  if (bairro) {
    const noBairroParts = [];
    if (address) {
      noBairroParts.push(numero ? `${address}, ${numero}` : address);
    }
    if (cleanCity) noBairroParts.push(cleanCity);
    if (state) noBairroParts.push(state);
    if (country) noBairroParts.push(country);
    if (noBairroParts.length > 0) {
      queries.push(noBairroParts.join(", "));
    }
  }

  // Query 3: Street + city + country
  if (address && cleanCity) {
    queries.push(`${address}, ${cleanCity}, ${country || 'Brasil'}`);
  }

  // Query 4: City + state + country
  if (cleanCity) {
    const cityParts = [cleanCity];
    if (state) cityParts.push(state);
    if (country) cityParts.push(country);
    queries.push(cityParts.join(", "));
  }

  // Query 5: Address + state + country
  if (address && !cleanCity) {
    const addrParts = [numero ? `${address}, ${numero}` : address];
    if (state) addrParts.push(state);
    addrParts.push(country || 'Brasil');
    queries.push(addrParts.join(", "));
  }

  // Remove duplicates
  return Array.from(new Set(queries));
}

/**
 * Main geocoding function - uses Mapbox first, Nominatim as fallback
 */
export async function geocodeAddress(
  address: string,
  numero?: string,
  bairro?: string,
  city?: string,
  state?: string,
  country?: string
): Promise<GeocodeResult> {
  const queries = buildQueries(address, numero, bairro, city, state, country);
  
  if (queries.length === 0) {
    return {
      latitude: 0,
      longitude: 0,
      displayName: "",
      found: false,
    };
  }

  // Try Mapbox first (fast, accurate)
  if (MAPBOX_ACCESS_TOKEN) {
    for (let i = 0; i < queries.length; i++) {
      console.log(`[Geocode] Mapbox attempt ${i + 1}: ${queries[i]}`);
      const result = await tryMapboxGeocode(queries[i]);
      if (result) {
        return result;
      }
    }
    console.log("[Geocode] Mapbox failed, trying Nominatim fallback...");
  }

  // Fallback to Nominatim
  for (let i = 0; i < queries.length; i++) {
    console.log(`[Geocode] Nominatim attempt ${i + 1}: ${queries[i]}`);
    const result = await tryNominatimGeocode(queries[i]);
    if (result) {
      return result;
    }
  }

  console.warn(`[Geocode] ✗ All geocoding strategies failed`);
  return {
    latitude: 0,
    longitude: 0,
    displayName: queries[0],
    found: false,
  };
}

/**
 * Reverse geocode: Convert coordinates to address
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{ address: string; found: boolean; source?: string }> {
  // Try Mapbox first
  if (MAPBOX_ACCESS_TOKEN) {
    try {
      const url = `${MAPBOX_BASE_URL}/${longitude},${latitude}.json?access_token=${MAPBOX_ACCESS_TOKEN}&language=pt&limit=1`;
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = MapboxResponseSchema.safeParse(data);
        
        if (parsed.success && parsed.data.features.length > 0) {
          return {
            address: parsed.data.features[0].place_name,
            found: true,
            source: "mapbox",
          };
        }
      }
    } catch (error) {
      console.error("[Mapbox Reverse] Error:", error);
    }
  }

  // Fallback to Nominatim
  await waitForNominatimRateLimit();

  try {
    const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
    url.searchParams.set("lat", latitude.toString());
    url.searchParams.set("lon", longitude.toString());
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return { address: "", found: false };
    }

    const data = await response.json();
    
    return {
      address: data.display_name || "",
      found: true,
      source: "nominatim",
    };
  } catch (error) {
    console.error("[Nominatim Reverse] Error:", error);
    return { address: "", found: false };
  }
}

export interface ReverseGeocodeResult {
  address: string;
  city: string | null;
  state: string | null;
  bairro: string | null;
  found: boolean;
  source?: string;
}

/**
 * Reverse geocode with structured address details
 */
export async function reverseGeocodeDetailed(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  // Try Mapbox first
  if (MAPBOX_ACCESS_TOKEN) {
    try {
      const url = `${MAPBOX_BASE_URL}/${longitude},${latitude}.json?access_token=${MAPBOX_ACCESS_TOKEN}&language=pt&limit=1`;
      
      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = MapboxResponseSchema.safeParse(data);
        
        if (parsed.success && parsed.data.features.length > 0) {
          const feature = parsed.data.features[0];
          
          let city: string | null = null;
          let state: string | null = null;
          let bairro: string | null = null;
          
          if (feature.context) {
            for (const ctx of feature.context) {
              if (ctx.id.startsWith("place.")) {
                city = ctx.text;
              } else if (ctx.id.startsWith("region.")) {
                state = ctx.text;
              } else if (ctx.id.startsWith("neighborhood.") || ctx.id.startsWith("locality.")) {
                bairro = ctx.text;
              }
            }
          }
          
          return {
            address: feature.place_name,
            city,
            state,
            bairro,
            found: true,
            source: "mapbox",
          };
        }
      }
    } catch (error) {
      console.error("[Mapbox Reverse Detailed] Error:", error);
    }
  }

  // Fallback to Nominatim
  await waitForNominatimRateLimit();

  try {
    const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
    url.searchParams.set("lat", latitude.toString());
    url.searchParams.set("lon", longitude.toString());
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      return { address: "", city: null, state: null, bairro: null, found: false };
    }

    const data = await response.json();
    const addressDetails = data.address;
    
    const city = addressDetails?.city || 
                 addressDetails?.municipality || 
                 addressDetails?.town || 
                 addressDetails?.village || 
                 addressDetails?.county || 
                 null;
    
    const state = addressDetails?.state || 
                  addressDetails?.state_district || 
                  addressDetails?.region ||
                  null;
    
    const bairro = addressDetails?.suburb || 
                   addressDetails?.neighbourhood || 
                   addressDetails?.quarter ||
                   addressDetails?.city_district ||
                   addressDetails?.district ||
                   addressDetails?.borough ||
                   null;
    
    return {
      address: data.display_name || "",
      city,
      state,
      bairro,
      found: true,
      source: "nominatim",
    };
  } catch (error) {
    console.error("[Nominatim Reverse Detailed] Error:", error);
    return { address: "", city: null, state: null, bairro: null, found: false };
  }
}
