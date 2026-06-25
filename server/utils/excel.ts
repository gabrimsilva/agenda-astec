import type { Request } from "express";
import type { InsertClient } from "@shared/schema";

/**
 * Process uploaded Excel/CSV file for client import
 * This is a simplified version - in production you would use xlsx or csv-parser
 */

export interface ExcelRow {
  row: number;
  data: Partial<InsertClient>;
  errors: string[];
  isValid: boolean;
}

export interface ExcelProcessResult {
  totalRows: number;
  validRows: ExcelRow[];
  invalidRows: ExcelRow[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
}

/**
 * Validate a single client row
 */
function validateClientRow(row: any, rowNumber: number): ExcelRow {
  const errors: string[] = [];
  const data: Partial<InsertClient> = {};

  // Required field: companyName
  if (!row.companyName || typeof row.companyName !== "string" || row.companyName.trim() === "") {
    errors.push("Nome da empresa é obrigatório");
  } else {
    data.companyName = row.companyName.trim();
  }

  // Optional fields with validation
  if (row.cnpj) {
    const cnpjClean = String(row.cnpj).replace(/\D/g, "");
    if (cnpjClean.length !== 14) {
      errors.push("CNPJ inválido (deve ter 14 dígitos)");
    } else {
      data.cnpj = cnpjClean;
    }
  }

  if (row.taxId) {
    data.taxId = String(row.taxId).trim();
  }

  if (row.contactName) {
    data.contactName = String(row.contactName).trim();
  }

  if (row.contactEmail) {
    const email = String(row.contactEmail).trim();
    if (!isValidEmail(email)) {
      errors.push("Email inválido");
    } else {
      data.contactEmail = email;
    }
  }

  if (row.contactPhone) {
    data.contactPhone = String(row.contactPhone).trim();
  }

  if (row.corporatePhone) {
    data.corporatePhone = String(row.corporatePhone).trim();
  }

  if (row.corporateEmail) {
    const email = String(row.corporateEmail).trim();
    if (!isValidEmail(email)) {
      errors.push("Email corporativo inválido");
    } else {
      data.corporateEmail = email;
    }
  }

  if (row.externalCode) {
    data.externalCode = String(row.externalCode).trim();
  }

  if (row.segment) {
    data.segment = String(row.segment).trim();
  }

  if (row.group) {
    data.group = String(row.group).trim();
  }

  if (row.notes) {
    data.notes = String(row.notes).trim();
  }

  if (row.teamId) {
    data.teamId = String(row.teamId).trim();
  }

  // Active status (default true)
  data.active = row.active !== false && row.active !== "false" && row.active !== "0";

  return {
    row: rowNumber,
    data,
    errors,
    isValid: errors.length === 0,
  };
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Parse Excel/CSV data
 * In production, this would use libraries like xlsx or csv-parser
 */
export function parseExcelData(jsonData: any[]): ExcelProcessResult {
  const validRows: ExcelRow[] = [];
  const invalidRows: ExcelRow[] = [];

  jsonData.forEach((row, index) => {
    const validatedRow = validateClientRow(row, index + 1);
    if (validatedRow.isValid) {
      validRows.push(validatedRow);
    } else {
      invalidRows.push(validatedRow);
    }
  });

  return {
    totalRows: jsonData.length,
    validRows,
    invalidRows,
    summary: {
      total: jsonData.length,
      valid: validRows.length,
      invalid: invalidRows.length,
    },
  };
}

/**
 * Expected Excel/CSV columns for client import
 */
export const EXPECTED_COLUMNS = [
  { key: "companyName", label: "Nome da Empresa", required: true },
  { key: "cnpj", label: "CNPJ", required: false },
  { key: "taxId", label: "CPF/CNPJ", required: false },
  { key: "contactName", label: "Nome do Contato", required: false },
  { key: "contactEmail", label: "Email do Contato", required: false },
  { key: "contactPhone", label: "Telefone do Contato", required: false },
  { key: "corporatePhone", label: "Telefone Corporativo", required: false },
  { key: "corporateEmail", label: "Email Corporativo", required: false },
  { key: "externalCode", label: "Código Externo", required: false },
  { key: "segment", label: "Segmento", required: false },
  { key: "group", label: "Grupo", required: false },
  { key: "notes", label: "Observações", required: false },
  { key: "teamId", label: "Equipe", required: false },
  { key: "active", label: "Ativo", required: false },
];
