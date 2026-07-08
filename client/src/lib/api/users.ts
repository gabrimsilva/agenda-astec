import { apiRequest } from "@/lib/queryClient";
import type { User, InsertUser } from "@shared/schema";

export async function fetchUsers(): Promise<User[]> {
  const res = await apiRequest("GET", "/api/users");
  return res.json();
}

export async function createUser(data: InsertUser): Promise<User> {
  const res = await apiRequest("POST", "/api/users", data);
  return res.json();
}

export async function updateUser(id: string, data: Partial<InsertUser>): Promise<User> {
  const res = await apiRequest("PUT", `/api/users/${id}`, data);
  return res.json();
}

export async function toggleIsActive(id: string, isActive: boolean): Promise<User> {
  // Use POST endpoint instead of PATCH to avoid WAF blocking PATCH requests
  const res = await apiRequest("POST", `/api/users/${id}/toggle-active`, { isActive });
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/users/${id}`);
}

