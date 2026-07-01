import { apiRequest } from "@/lib/queryClient";
import type { Technician } from "@shared/schema";

export async function fetchTechnicians(): Promise<Technician[]> {
  const token = localStorage.getItem("astec_token");
  const response = await fetch("/api/technicians", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error("Erro ao buscar técnicos");
  }
  return response.json();
}

export async function createTechnician(data: any): Promise<Technician> {
  const response = await apiRequest("POST", "/api/technicians", data);
  return response.json();
}

export async function createUserAndTechnician(data: any): Promise<{ user: any; technician: Technician }> {
  const response = await apiRequest("POST", "/api/users-with-technician", data);
  return response.json();
}

export async function updateTechnician(id: string, data: any): Promise<Technician> {
  // POST alias (corporate WAF blocks PUT/PATCH methods)
  const response = await apiRequest("POST", `/api/technicians/${id}/update`, data);
  return response.json();
}

export async function updateTechnicianDatasulProfile(id: string, datasulUsername: string): Promise<{ datasulUsername: string | null }> {
  const response = await apiRequest("POST", `/api/technicians/${id}/datasul-profile`, { datasulUsername });
  return response.json();
}

export async function deleteTechnician(id: string): Promise<void> {
  await apiRequest("DELETE", `/api/technicians/${id}`);
}
