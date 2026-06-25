import { z } from "zod";

// Mapbox API configuration
const MAPBOX_BASE_URL = "https://api.mapbox.com/directions/v5/mapbox";
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

// OSRM API configuration (fallback)
const OSRM_BASE_URL = "http://router.project-osrm.org";

// Mapbox Directions API response schema
const MapboxRouteSchema = z.object({
  code: z.string(),
  routes: z.array(z.object({
    distance: z.number(), // meters
    duration: z.number(), // seconds
    geometry: z.any(), // GeoJSON LineString or polyline
    legs: z.array(z.object({
      distance: z.number(),
      duration: z.number(),
      summary: z.string().optional(),
      steps: z.array(z.object({
        distance: z.number(),
        duration: z.number(),
        name: z.string().optional(),
        maneuver: z.object({
          type: z.string(),
          location: z.array(z.number()),
          instruction: z.string().optional(),
        }).optional(),
      })).optional(),
    })),
  })),
  waypoints: z.array(z.object({
    name: z.string().optional(),
    location: z.array(z.number()),
  })),
});

// Track which service was used for logging/debugging
let lastServiceUsed: "mapbox" | "osrm" = "osrm";

// OSRM route response schema
const OSRMRouteSchema = z.object({
  code: z.string(),
  routes: z.array(z.object({
    distance: z.number(), // meters
    duration: z.number(), // seconds
    geometry: z.any(), // GeoJSON LineString
    legs: z.array(z.object({
      distance: z.number(),
      duration: z.number(),
      steps: z.array(z.object({
        distance: z.number(),
        duration: z.number(),
        name: z.string().optional(),
        maneuver: z.object({
          type: z.string(),
          location: z.array(z.number()),
        }).optional(),
      })).optional(),
    })),
  })),
  waypoints: z.array(z.object({
    name: z.string().optional(),
    location: z.array(z.number()),
  })),
});

// OSRM trip response schema (uses 'trips' instead of 'routes')
const OSRMTripSchema = z.object({
  code: z.string(),
  trips: z.array(z.object({
    distance: z.number(), // meters
    duration: z.number(), // seconds
    geometry: z.any(), // GeoJSON LineString
    legs: z.array(z.object({
      distance: z.number(),
      duration: z.number(),
      steps: z.array(z.object({
        distance: z.number(),
        duration: z.number(),
        name: z.string().optional(),
        maneuver: z.object({
          type: z.string(),
          location: z.array(z.number()),
        }).optional(),
      })).optional(),
    })),
  })),
  waypoints: z.array(z.object({
    name: z.string().optional(),
    location: z.array(z.number()),
    waypoint_index: z.number(),
    trips_index: z.number(),
  })),
});

export interface Waypoint {
  latitude: number;
  longitude: number;
  name?: string;
}

export interface RouteStep {
  distance: number; // meters
  duration: number; // seconds
  instruction: string;
  location: [number, number]; // [longitude, latitude]
}

export interface RouteLeg {
  distance: number; // meters
  duration: number; // seconds
  steps: RouteStep[];
}

export interface RouteResult {
  distance: number; // total distance in meters
  duration: number; // total duration in seconds
  distanceKm: number; // distance in kilometers
  durationMinutes: number; // duration in minutes
  geometry: any; // GeoJSON LineString
  legs: RouteLeg[];
  waypoints: Array<{
    name?: string;
    location: [number, number]; // [longitude, latitude]
  }>;
  success: boolean;
}

/**
 * Calculate route using Mapbox Directions API
 * More accurate than OSRM, especially for Brazilian roads
 */
async function calculateRouteMapbox(
  waypoints: Waypoint[],
  profile: "driving" | "driving-traffic" | "walking" | "cycling" = "driving"
): Promise<RouteResult> {
  if (!MAPBOX_ACCESS_TOKEN) {
    console.warn("Mapbox token not configured, skipping Mapbox routing");
    return { distance: 0, duration: 0, distanceKm: 0, durationMinutes: 0, geometry: null, legs: [], waypoints: [], success: false };
  }

  try {
    // Build coordinates string: lon,lat;lon,lat;...
    const coordinates = waypoints
      .map(w => `${w.longitude},${w.latitude}`)
      .join(";");

    const url = `${MAPBOX_BASE_URL}/${profile}/${coordinates}`;
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      steps: "true",
      geometries: "geojson",
      overview: "full",
    });

    const response = await fetch(`${url}?${params.toString()}`);

    if (!response.ok) {
      console.error(`Mapbox error: ${response.status} ${response.statusText}`);
      return { distance: 0, duration: 0, distanceKm: 0, durationMinutes: 0, geometry: null, legs: [], waypoints: [], success: false };
    }

    const data = await response.json();
    const parsed = MapboxRouteSchema.parse(data);

    if (parsed.code !== "Ok" || parsed.routes.length === 0) {
      console.warn(`Mapbox route calculation failed: ${parsed.code}`);
      return { distance: 0, duration: 0, distanceKm: 0, durationMinutes: 0, geometry: null, legs: [], waypoints: [], success: false };
    }

    const route = parsed.routes[0];
    lastServiceUsed = "mapbox";

    // Process legs and steps
    const legs: RouteLeg[] = route.legs.map(leg => ({
      distance: leg.distance,
      duration: leg.duration,
      steps: (leg.steps || []).map(step => ({
        distance: step.distance,
        duration: step.duration,
        instruction: step.maneuver?.instruction || step.name || "",
        location: (step.maneuver?.location || [0, 0]) as [number, number],
      })),
    }));

    console.log(`[Mapbox] Route calculated: ${Math.round(route.distance / 1000 * 10) / 10} km, ${Math.round(route.duration / 60)} min`);

    return {
      distance: route.distance,
      duration: route.duration,
      distanceKm: Math.round(route.distance / 1000 * 10) / 10,
      durationMinutes: Math.round(route.duration / 60),
      geometry: route.geometry,
      legs,
      waypoints: parsed.waypoints.map(wp => ({
        name: wp.name,
        location: wp.location as [number, number],
      })),
      success: true,
    };
  } catch (error) {
    console.error("Mapbox routing error:", error);
    return { distance: 0, duration: 0, distanceKm: 0, durationMinutes: 0, geometry: null, legs: [], waypoints: [], success: false };
  }
}

/**
 * Calculate route using OSRM (fallback service)
 */
async function calculateRouteOSRM(
  waypoints: Waypoint[],
  profile: "car" | "bike" | "foot" = "car"
): Promise<RouteResult> {
  try {
    // Build coordinates string: lon,lat;lon,lat;...
    const coordinates = waypoints
      .map(w => `${w.longitude},${w.latitude}`)
      .join(";");

    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${coordinates}`;
    const params = new URLSearchParams({
      steps: "true",
      geometries: "geojson",
      overview: "full",
      annotations: "true",
    });

    const response = await fetch(`${url}?${params.toString()}`);

    if (!response.ok) {
      console.error(`OSRM error: ${response.status} ${response.statusText}`);
      return { distance: 0, duration: 0, distanceKm: 0, durationMinutes: 0, geometry: null, legs: [], waypoints: [], success: false };
    }

    const data = await response.json();
    const parsed = OSRMRouteSchema.parse(data);

    if (parsed.code !== "Ok" || parsed.routes.length === 0) {
      console.warn(`OSRM route calculation failed: ${parsed.code}`);
      return { distance: 0, duration: 0, distanceKm: 0, durationMinutes: 0, geometry: null, legs: [], waypoints: [], success: false };
    }

    const route = parsed.routes[0];
    lastServiceUsed = "osrm";

    // Process legs and steps
    const legs: RouteLeg[] = route.legs.map(leg => ({
      distance: leg.distance,
      duration: leg.duration,
      steps: (leg.steps || []).map(step => ({
        distance: step.distance,
        duration: step.duration,
        instruction: step.name || "",
        location: (step.maneuver?.location || [0, 0]) as [number, number],
      })),
    }));

    console.log(`[OSRM Fallback] Route calculated: ${Math.round(route.distance / 1000 * 10) / 10} km, ${Math.round(route.duration / 60)} min`);

    return {
      distance: route.distance,
      duration: route.duration,
      distanceKm: Math.round(route.distance / 1000 * 10) / 10,
      durationMinutes: Math.round(route.duration / 60),
      geometry: route.geometry,
      legs,
      waypoints: parsed.waypoints.map(wp => ({
        name: wp.name,
        location: wp.location as [number, number],
      })),
      success: true,
    };
  } catch (error) {
    console.error("OSRM routing error:", error);
    return { distance: 0, duration: 0, distanceKm: 0, durationMinutes: 0, geometry: null, legs: [], waypoints: [], success: false };
  }
}

/**
 * Calculate route between multiple waypoints
 * Uses Mapbox as primary service (more accurate), OSRM as fallback
 * Returns distance, duration, and route geometry
 */
export async function calculateRoute(
  waypoints: Waypoint[],
  profile: "car" | "bike" | "foot" = "car"
): Promise<RouteResult> {
  if (waypoints.length < 2) {
    return {
      distance: 0,
      duration: 0,
      distanceKm: 0,
      durationMinutes: 0,
      geometry: null,
      legs: [],
      waypoints: [],
      success: false,
    };
  }

  // Map profile to Mapbox profile
  const mapboxProfile = profile === "car" ? "driving-traffic" : profile === "bike" ? "cycling" : "walking";

  // Try Mapbox first (more accurate)
  if (MAPBOX_ACCESS_TOKEN) {
    const mapboxResult = await calculateRouteMapbox(waypoints, mapboxProfile);
    if (mapboxResult.success) {
      return mapboxResult;
    }
    console.warn("Mapbox failed, falling back to OSRM");
  }

  // Fallback to OSRM
  return calculateRouteOSRM(waypoints, profile);
}

/**
 * Get which routing service was used for the last calculation
 */
export function getLastServiceUsed(): "mapbox" | "osrm" {
  return lastServiceUsed;
}

/**
 * Calculate optimized route (Traveling Salesman Problem)
 * Uses OSRM Trip service to find best order, then Mapbox for accurate distances
 */
export async function calculateOptimizedRoute(
  waypoints: Waypoint[],
  profile: "car" | "bike" | "foot" = "car",
  options: { fixedStart?: boolean; roundTrip?: boolean } = {}
): Promise<RouteResult & { waypointOrder: number[] }> {
  if (waypoints.length < 2) {
    return {
      distance: 0,
      duration: 0,
      distanceKm: 0,
      durationMinutes: 0,
      geometry: null,
      legs: [],
      waypoints: [],
      waypointOrder: [],
      success: false,
    };
  }

  try {
    // Build coordinates string
    const coordinates = waypoints
      .map(w => `${w.longitude},${w.latitude}`)
      .join(";");

    const url = `${OSRM_BASE_URL}/trip/v1/${profile}/${coordinates}`;
    const params = new URLSearchParams({
      steps: "true",
      geometries: "geojson",
      overview: "full",
      source: options.fixedStart ? "first" : "any",
      destination: options.roundTrip ? "any" : "last",
    });

    const response = await fetch(`${url}?${params.toString()}`);

    if (!response.ok) {
      console.error(`OSRM trip error: ${response.status}`);
      const regularRoute = await calculateRoute(waypoints, profile);
      return {
        ...regularRoute,
        waypointOrder: waypoints.map((_, i) => i),
      };
    }

    const data = await response.json();
    const parsed = OSRMTripSchema.parse(data);

    if (parsed.code !== "Ok" || parsed.trips.length === 0) {
      const regularRoute = await calculateRoute(waypoints, profile);
      return {
        ...regularRoute,
        waypointOrder: waypoints.map((_, i) => i),
      };
    }

    // Extract waypoint order from OSRM trip optimization
    const waypointOrder = parsed.waypoints.map(wp => wp.waypoint_index);
    
    // Reorder waypoints according to OSRM optimization
    const optimizedWaypoints = waypointOrder.map(i => waypoints[i]);
    
    // If Mapbox is available, recalculate route with optimized order for better accuracy
    if (MAPBOX_ACCESS_TOKEN) {
      const mapboxRoute = await calculateRoute(optimizedWaypoints, profile);
      if (mapboxRoute.success) {
        console.log(`[Optimized Route] Order: ${waypointOrder.join(" → ")}, Distance: ${mapboxRoute.distanceKm} km (Mapbox)`);
        return {
          ...mapboxRoute,
          waypointOrder,
        };
      }
    }

    // Fallback: use OSRM trip data
    const trip = parsed.trips[0];
    lastServiceUsed = "osrm";

    const legs: RouteLeg[] = trip.legs.map(leg => ({
      distance: leg.distance,
      duration: leg.duration,
      steps: (leg.steps || []).map(step => ({
        distance: step.distance,
        duration: step.duration,
        instruction: step.name || "",
        location: (step.maneuver?.location || [0, 0]) as [number, number],
      })),
    }));

    console.log(`[Optimized Route] Order: ${waypointOrder.join(" → ")}, Distance: ${Math.round(trip.distance / 1000 * 10) / 10} km (OSRM)`);

    return {
      distance: trip.distance,
      duration: trip.duration,
      distanceKm: Math.round(trip.distance / 1000 * 10) / 10,
      durationMinutes: Math.round(trip.duration / 60),
      geometry: trip.geometry,
      legs,
      waypoints: parsed.waypoints.map(wp => ({
        name: wp.name,
        location: wp.location as [number, number],
      })),
      waypointOrder,
      success: true,
    };
  } catch (error) {
    console.error("OSRM trip optimization error:", error);
    const regularRoute = await calculateRoute(waypoints, profile);
    return {
      ...regularRoute,
      waypointOrder: waypoints.map((_, i) => i),
    };
  }
}

/**
 * Generate deep links for navigation apps
 */
export interface NavigationLinks {
  googleMaps: string;
  waze: string;
  appleMaps: string;
}

export function generateNavigationLinks(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  waypoints?: Array<{ latitude: number; longitude: number }>
): NavigationLinks {
  const originStr = `${origin.latitude},${origin.longitude}`;
  const destStr = `${destination.latitude},${destination.longitude}`;

  // Google Maps
  let googleMaps = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=driving`;
  
  if (waypoints && waypoints.length > 0) {
    const waypointsStr = waypoints
      .map(w => `${w.latitude},${w.longitude}`)
      .join("|");
    googleMaps += `&waypoints=${waypointsStr}`;
  }

  // Waze (only supports single destination, no waypoints)
  const waze = `https://waze.com/ul?ll=${destination.latitude},${destination.longitude}&navigate=yes`;

  // Apple Maps (only supports single destination)
  const appleMaps = `http://maps.apple.com/?daddr=${destStr}&dirflg=d`;

  return {
    googleMaps,
    waze,
    appleMaps,
  };
}
