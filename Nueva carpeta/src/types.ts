export type UserRole = "admin" | "operator";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  rol?: "administrador" | "operario"; // security check string role
  cedula?: string;                    // Cédula/RUC
  phone?: string;                     // Teléfono
  status?: "Activo" | "Inactivo" | "Eliminado";    // Estado del operario
  detailRole?: "Administrador" | "Operario Sastre" | "Operario Costurera"; // Rol detallado
  createdAt: any; // Firestore Timestamp
  nombreCompleto?: string;            // Spanish name mapping
  cedulaRuc?: string;                 // Spanish cedula mapping
  telefono?: string;                  // Spanish phone mapping
  estado?: string;                    // Spanish status mapping
}

export interface RawMaterial {
  id: string;
  name: string;
  category: string; // e.g., "Tela", "Hilo", "Botones", "Accesorios"
  quantity: number;
  unit: string; // e.g., "metros", "conos", "unidades"
  minStock: number;
  costPerUnit: number;
  updatedAt: any; // Firestore Timestamp
}

export type OrderStatus =
  | "En Diseño"
  | "Corte"
  | "Confección/Costura"
  | "Acabado/Planchado"
  | "Control de Calidad"
  | "Empaque"
  | "Listo";

export interface MedidasDetalles {
  modalidad: "Talla" | "Medidas";
  tallaBlusa?: "S" | "M" | "L" | "XL" | "XXL" | "";
  tallaAnaco?: "28" | "30" | "32" | "34" | "36" | "38" | "40" | "";
  anchoEspalda?: number;
  talleEspalda?: number;
  contornoBusto?: number;
  contornoCintura?: number;
  contornoCadera?: number;
  largoManga?: number;
  largoTotalBlusa?: number;
  puno?: number;
  pinza?: number;
  brazo?: number;
  colorBlusa?: string;
  anchoPollera?: number;
  faja?: number;
  dejaTela: boolean;
  dejaTelaBlusa?: boolean;
  dejaTelaPollera?: boolean;
  dejaTelaFaja?: boolean;
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  garmentType: string;
  patternUrl: string;
  bocetoUrl?: string;
  quantity: number;
  size: "S" | "M" | "L" | "XL" | string;
  color: string;
  limitDate: string; // YYYY-MM-DD
  assignedOperatorId: string;
  assignedOperatorName: string;
  status: OrderStatus;
  notes: string;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  medidasDetalles?: MedidasDetalles;
  clientName?: string;
  clientPhone?: string;
  clientIdNumber?: string;
  clientIdType?: string;
  clientAddress?: string;
  valorPrenda?: number;
  anticipo?: number;
  saldo?: number;
}

export interface FinishedProduct {
  id: string;
  name: string;
  type: string; // e.g., "Camisa", "Pantalón"
  size: string;
  color: string;
  stock: number;
  salePrice: number;
  materialCostPerUnit: number;
  laborCostPerUnit: number;
  updatedAt: any; // Firestore Timestamp
}

export interface FixedCost {
  id: string;
  concept: string;
  amount: number;
  period: string; // e.g., "Mensual", "Anual"
  updatedAt: any; // Firestore Timestamp
}

export interface Client {
  id: string;
  name: string;
  idType: "cédula" | "ruc" | "pasaporte" | "consumidor_final";
  idNumber: string;
  email: string;
  phone: string;
  address: string;
  updatedAt: string;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  discount: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  claveAcceso: string;
  clientId: string;
  clientName: string;
  clientIdNumber: string;
  clientEmail: string;
  subtotalIVA: number;
  subtotal0: number;
  discount: number;
  ivaRate: number;
  ivaAmount: number;
  total: number;
  status: "AUTORIZADO" | "PENDIENTE" | "ERROR" | "RECIBO_INTERNO";
  ambiente: "Pruebas" | "Producción";
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryLine {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  concept: string;
  reference: string;
  lines: JournalEntryLine[];
  createdAt: string;
}

export interface Purchase {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  iva: number;
  total: number;
  paymentStatus: "Pagado" | "Pendiente";
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  ruc: string;
  phone: string;
  email: string;
  address: string;
  updatedAt: string;
}

export interface PayrollPayment {
  id: string;
  operatorId: string;
  operatorName: string;
  month: string;
  baseSalary: number;
  pieceworkEarnings: number;
  iessObligation: number; // 12.15% patronal
  employeeIessDeduction: number; // 9.45% personal
  totalPaid: number;
  paymentStatus: "Pagado" | "Pendiente";
  createdAt: string;
}

export interface AttendanceLog {
  id: string;
  operatorId: string;
  operatorName: string;
  date: string; // YYYY-MM-DD
  checkIn?: string | null; // ISO Timestamp or null
  checkOut?: string | null; // ISO Timestamp or null
  hoursWorked: number;
  hoursExtra: number;
  status: "Puntual" | "Atraso" | "Falta Justificada" | "Vacaciones" | "Permiso Médico" | "Falta";
  justified: boolean;
  justificationReason: string;
  createdAt: string;
}

