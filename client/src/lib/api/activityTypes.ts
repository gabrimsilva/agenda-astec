import { apiRequest } from "@/lib/queryClient";
import type { ActivityType, InsertActivityType } from "@shared/schema";

export async function fetchActivityTypes(): Promise<ActivityType[]> {
  const res = await apiRequest("GET", "/api/activity-types");
  return res.json();
}

export async function createActivityType(data: InsertActivityType): Promise<ActivityType> {
  const res = await apiRequest("POST", "/api/activity-types", data);
  return res.json();
}

export async function updateActivityType(id: string, data: Partial<InsertActivityType>): Promise<ActivityType> {
  const res = await apiRequest("PUT", `/api/activity-types/${id}`, data);
  return res.json();
}

export async function toggleRequiresTravel(id: string, requiresTravel: boolean): Promise<ActivityType> {
  // Use POST endpoint instead of PATCH to avoid WAF blocking PATCH requests
  const res = await apiRequest("POST", `/api/activity-types/${id}/toggle-requires-travel`, { requiresTravel });
  return res.json();
}

export async function deleteActivityType(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/activity-types/${id}`);
}

