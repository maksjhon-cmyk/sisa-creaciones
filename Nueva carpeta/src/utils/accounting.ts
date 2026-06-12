import { doc, setDoc, getDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { JournalEntry } from "../types";

export interface Account {
  code: string;
  name: string;
  category: "Activo" | "Pasivo" | "Patrimonio" | "Ingresos" | "Costos" | "Gastos";
  parentCode?: string;
  isGroup?: boolean;
  updatedAt?: string;
}

export const PLAN_DE_CUENTAS: Account[] = [
  // 1. Activo
  { code: "1", name: "Activo", category: "Activo", isGroup: true },
  { code: "1.1", name: "Caja y Bancos", category: "Activo", parentCode: "1", isGroup: false },
  { code: "1.2", name: "Inventario de Materia Prima", category: "Activo", parentCode: "1", isGroup: false },
  { code: "1.3", name: "Inventario de Producto Terminado", category: "Activo", parentCode: "1", isGroup: false },
  { code: "1.4", name: "Cuentas por Cobrar Clientes", category: "Activo", parentCode: "1", isGroup: false },
  
  // 2. Pasivo
  { code: "2", name: "Pasivo", category: "Pasivo", isGroup: true },
  { code: "2.1", name: "Cuentas por Pagar Proveedores", category: "Pasivo", parentCode: "2", isGroup: false },
  { code: "2.2", name: "Obligaciones IESS por Pagar", category: "Pasivo", parentCode: "2", isGroup: false },
  { code: "2.3", name: "Nómina por Pagar", category: "Pasivo", parentCode: "2", isGroup: false },
  { code: "2.4", name: "Anticipos de Clientes o Ingresos Diferidos", category: "Pasivo", parentCode: "2", isGroup: false },
  
  // 3. Patrimonio
  { code: "3", name: "Patrimonio", category: "Patrimonio", isGroup: true },
  { code: "3.1", name: "Capital Social", category: "Patrimonio", parentCode: "3", isGroup: false },
  
  // 4. Ingresos
  { code: "4", name: "Ingresos", category: "Ingresos", isGroup: true },
  { code: "4.1", name: "Ventas de Prendas Textiles (Factura)", category: "Ingresos", parentCode: "4", isGroup: false },
  { code: "4.2", name: "Ingresos por Nota de Venta Interna", category: "Ingresos", parentCode: "4", isGroup: false },
  
  // 5. Costos
  { code: "5", name: "Costos de Producción", category: "Costos", isGroup: true },
  { code: "5.1", name: "Mano de Obra Directa (Nómina Operarios)", category: "Costos", parentCode: "5", isGroup: false },
  { code: "5.2", name: "Gasto de Materia Prima Utilizada", category: "Costos", parentCode: "5", isGroup: false },
  { code: "5.3", name: "Gasto Aporte Patronal IESS", category: "Costos", parentCode: "5", isGroup: false },

  // 6. Gastos
  { code: "6", name: "Gastos", category: "Gastos", isGroup: true },
  { code: "6.1", name: "Gastos Operativos (Arriendos, Luz, etc.)", category: "Gastos", parentCode: "6", isGroup: false },
];

/**
 * Automator helper to record journal entries.
 */
export async function autoRegisterJournalEntry(
  concept: string,
  referenceId: string,
  lines: { accountId: string; debit: number; credit: number }[],
  customDate?: string
) {
  try {
    const entryId = `asiento_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const dateStr = customDate || new Date().toISOString();

    const formattedLines = [];
    for (const l of lines) {
      let name = "Cuenta Desconocida";
      
      // Try to find in standard plan first
      const acct = PLAN_DE_CUENTAS.find((a) => a.code === l.accountId);
      if (acct) {
        name = acct.name;
      } else {
        // Safe check in Firestore database in case it is a dynamic account
        try {
          const docRef = doc(db, "accounts", l.accountId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            name = docSnap.data().name;
          }
        } catch (dbErr) {
          console.warn("Failed lookup for account in DB: ", dbErr);
        }
      }

      formattedLines.push({
        accountId: l.accountId,
        accountName: name,
        debit: Number(l.debit.toFixed(2)),
        credit: Number(l.credit.toFixed(2)),
      });
    }

    const entry: JournalEntry = {
      id: entryId,
      date: dateStr,
      concept,
      reference: referenceId,
      lines: formattedLines,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, "journal_entries", entryId), entry);
    console.log(`Automatic journal entry registered successfully: ${concept}`);
    return entry;
  } catch (err) {
    console.error("Failed to write automatic journal entry: ", err);
    handleFirestoreError(err, OperationType.CREATE, "journal_entries");
  }
}
