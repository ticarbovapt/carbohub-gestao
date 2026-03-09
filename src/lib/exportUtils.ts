import * as XLSX from "xlsx";

export interface ExportColumn<T> {
  header: string;
  accessor: keyof T | ((row: T) => string | number | null);
}

export function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
) {
  // Transform data based on columns
  const exportData = data.map((row) => {
    const newRow: Record<string, string | number | null> = {};
    columns.forEach((col) => {
      const value =
        typeof col.accessor === "function" ? col.accessor(row) : (row[col.accessor] as string | number | null);
      newRow[col.header] = value;
    });
    return newRow;
  });

  // Create worksheet
  const ws = XLSX.utils.json_to_sheet(exportData);

  // Auto-size columns
  const colWidths = columns.map((col) => ({
    wch: Math.max(col.header.length, 15),
  }));
  ws["!cols"] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");

  // Download
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
) {
  // Create header row
  const headers = columns.map((col) => col.header);

  // Create data rows
  const rows = data.map((row) =>
    columns.map((col) => {
      const value =
        typeof col.accessor === "function" ? col.accessor(row) : (row[col.accessor] as string | number | null);
      // Escape quotes and wrap in quotes if contains comma
      const strValue = String(value ?? "");
      if (strValue.includes(",") || strValue.includes('"') || strValue.includes("\n")) {
        return `"${strValue.replace(/"/g, '""')}"`;
      }
      return strValue;
    })
  );

  // Combine
  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  // Download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Specific export configurations
export const LICENSEE_EXPORT_COLUMNS = [
  { header: "Código", accessor: "code" as const },
  { header: "Nome", accessor: "name" as const },
  { header: "Razão Social", accessor: "legal_name" as const },
  { header: "CNPJ", accessor: "document_number" as const },
  { header: "Email", accessor: "email" as const },
  { header: "Telefone", accessor: "phone" as const },
  { header: "Endereço", accessor: "address_street" as const },
  { header: "Cidade", accessor: "address_city" as const },
  { header: "Estado", accessor: "address_state" as const },
  { header: "CEP", accessor: "address_zip" as const },
  { header: "Status", accessor: "status" as const },
  { header: "Total Máquinas", accessor: "total_machines" as const },
  { header: "Receita Total", accessor: "total_revenue" as const },
  { header: "Performance", accessor: "performance_score" as const },
  { header: "Início Contrato", accessor: "contract_start_date" as const },
  { header: "Fim Contrato", accessor: "contract_end_date" as const },
  { header: "Criado em", accessor: "created_at" as const },
];

export const MACHINE_EXPORT_COLUMNS = [
  { header: "ID", accessor: "machine_id" as const },
  { header: "Modelo", accessor: "model" as const },
  { header: "Serial", accessor: "serial_number" as const },
  {
    header: "Licenciado",
    accessor: (row: { licensee?: { name?: string } }) => row.licensee?.name || "",
  },
  { header: "Endereço", accessor: "location_address" as const },
  { header: "Cidade", accessor: "location_city" as const },
  { header: "Estado", accessor: "location_state" as const },
  { header: "Status", accessor: "status" as const },
  { header: "Capacidade", accessor: "capacity" as const },
  { header: "Unidades Dispensadas", accessor: "total_units_dispensed" as const },
  { header: "Créditos Gerados", accessor: "total_credits_generated" as const },
  { header: "Data Instalação", accessor: "installation_date" as const },
  { header: "Última Manutenção", accessor: "last_maintenance_date" as const },
  { header: "Próxima Manutenção", accessor: "next_maintenance_date" as const },
  { header: "Criado em", accessor: "created_at" as const },
];
