import React, { useState, useEffect, FormEvent } from "react";
import { collection, onSnapshot, query, setDoc, doc, deleteDoc, getDocs, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { 
  UserProfile, 
  RawMaterial, 
  FixedCost, 
  Invoice, 
  Supplier, 
  Purchase, 
  PayrollPayment, 
  JournalEntry,
  AttendanceLog
} from "../types";
import { 
  Account,
  PLAN_DE_CUENTAS, 
  autoRegisterJournalEntry 
} from "../utils/accounting";
import { 
  Landmark, 
  BookOpen, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Calculator, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Receipt, 
  Calendar, 
  Clipboard, 
  Scale, 
  Eye, 
  CreditCard, 
  Activity,
  FileCheck,
  Sparkles,
  Upload,
  FileText,
  Clock
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend, 
  ReferenceLine 
} from "recharts";

interface AccountingProps {
  user: UserProfile;
}

export default function Accounting({ user }: AccountingProps) {
  const [subTab, setSubTab] = useState<"ledger" | "purchases" | "payroll" | "reports">("ledger");

  // Databases States
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payrollPayments, setPayrollPayments] = useState<PayrollPayment[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [operators, setOperators] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Chart of Accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Custom subaccount form states
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [selectedParentAccount, setSelectedParentAccount] = useState<Account | null>(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountCode, setNewAccountCode] = useState("");

  // Manual accounting journal entry states
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [manualConcept, setManualConcept] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().substring(0, 10));
  const [manualReference, setManualReference] = useState("");
  const [manualLines, setManualLines] = useState<Array<{ accountCode: string; debit: number; credit: number; detailConcept: string }>>([
    { accountCode: "", debit: 0, credit: 0, detailConcept: "" },
    { accountCode: "", debit: 0, credit: 0, detailConcept: "" }
  ]);

  // --- Sub-forms states ---
  // Supplier form
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supName, setSupName] = useState("");
  const [supRuc, setSupRuc] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supEmail, setSupEmail] = useState("");
  const [supAddress, setSupAddress] = useState("");

  // Purchase Form
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purInvoice, setPurInvoice] = useState("");
  const [purSupplierId, setPurSupplierId] = useState("");
  const [purMaterialId, setPurMaterialId] = useState("");
  const [purQty, setPurQty] = useState<number>(0);
  const [purCost, setPurCost] = useState<number>(0.0);
  const [purStatus, setPurStatus] = useState<"Pagado" | "Pendiente">("Pagado");

  // --- AI OCR invoice scanner state hooks ---
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrStep, setOcrStep] = useState<"upload" | "preview" | "success">("upload");
  const [ocrImageName, setOcrImageName] = useState("");
  const [ocrResult, setOcrResult] = useState<{
    supplier: {
      name: string;
      ruc: string;
      phone: string;
      email: string;
      address: string;
    };
    purchase: {
      invoiceNumber: string;
      date: string;
      materialSuggestedName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      iva: number;
      total: number;
    };
    accounting: {
      debitAccount: string;
      creditAccount: string;
      reasoning: string;
    };
  } | null>(null);

  const [ocrSelectedMaterialId, setOcrSelectedMaterialId] = useState("");
  const [ocrPaymentStatus, setOcrPaymentStatus] = useState<"Pagado" | "Pendiente">("Pagado");
  const [ocrCreateNewMaterial, setOcrCreateNewMaterial] = useState(false);
  const [ocrNewMaterialUnit, setOcrNewMaterialUnit] = useState("unidades");
  const [ocrNewMaterialCategory, setOcrNewMaterialCategory] = useState("Tela");

  // Payroll Form
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [payOperatorId, setPayOperatorId] = useState("");
  const [payBaseSalary, setPayBaseSalary] = useState<number>(460.0); // Salario básico Ecuador
  const [payMonth, setPayMonth] = useState("");
  const [payPieceworkRate, setPayPieceworkRate] = useState<number>(1.5);
  const [payStatus, setPayStatus] = useState<"Pagado" | "Pendiente">("Pagado");
  const [completedOrdersCount, setCompletedOrdersCount] = useState<number>(0);
  const [completedGarmentsQty, setCompletedGarmentsQty] = useState<number>(0);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);

  // Active entries viewer modal
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  // General errors / notices
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isAdmin = user.role === "admin" || user.uid === "Sisa-Creaciones-ERP" || user.email === "maksjhon@gmail.com";

  // Initial Realtime subscriptions
  useEffect(() => {
    setLoading(true);
    setErrorMessage(null);

    const unsubEntries = onSnapshot(query(collection(db, "journal_entries")), (snap) => {
      const items: JournalEntry[] = [];
      snap.forEach((d) => items.push(d.data() as JournalEntry));
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setJournalEntries(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "journal_entries"));

    const unsubPurchases = onSnapshot(query(collection(db, "purchases")), (snap) => {
      const items: Purchase[] = [];
      snap.forEach((d) => items.push(d.data() as Purchase));
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setPurchases(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "purchases"));

    const unsubSuppliers = onSnapshot(query(collection(db, "suppliers")), (snap) => {
      const items: Supplier[] = [];
      snap.forEach((d) => items.push(d.data() as Supplier));
      setSuppliers(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "suppliers"));

    const unsubPayroll = onSnapshot(query(collection(db, "payroll_payments")), (snap) => {
      const items: PayrollPayment[] = [];
      snap.forEach((d) => items.push(d.data() as PayrollPayment));
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setPayrollPayments(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "payroll_payments"));

    const unsubMaterials = onSnapshot(query(collection(db, "raw_materials")), (snap) => {
      const items: RawMaterial[] = [];
      snap.forEach((d) => items.push(d.data() as RawMaterial));
      setRawMaterials(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "raw_materials"));

    const unsubCosts = onSnapshot(query(collection(db, "fixed_costs")), (snap) => {
      const items: FixedCost[] = [];
      snap.forEach((d) => items.push(d.data() as FixedCost));
      setFixedCosts(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "fixed_costs"));

    const unsubInvoice = onSnapshot(query(collection(db, "invoices")), (snap) => {
      const items: Invoice[] = [];
      snap.forEach((d) => items.push(d.data() as Invoice));
      setInvoices(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "invoices"));

    // Real-time subscription to attendance logs for automatic payroll integration
    const unsubAttendance = onSnapshot(query(collection(db, "attendance_logs")), (snap) => {
      const items: AttendanceLog[] = [];
      snap.forEach((d) => items.push(d.data() as AttendanceLog));
      setAttendanceLogs(items);
    }, (err) => console.warn("Error loading attendance logs in accounting module: ", err));

    // Operators list
    const unsubOps = onSnapshot(query(collection(db, "users")), (snap) => {
      const items: UserProfile[] = [];
      snap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (u.role === "operator") items.push(u);
      });
      setOperators(items);
      setLoading(false);
    }, (err) => console.warn("Error retrieving operator profiles: ", err));

    // Dynamic accounts catalog subscription
    const unsubAccounts = onSnapshot(query(collection(db, "accounts")), (snap) => {
      const items: Account[] = [];
      snap.forEach((d) => items.push(d.data() as Account));
      
      if (items.length === 0) {
        console.log("Empty accounts in Firestore, seeding default Ecuadorian NIIF-compliant catalog...");
        PLAN_DE_CUENTAS.forEach(async (acct) => {
          try {
            await setDoc(doc(db, "accounts", acct.code), acct);
          } catch (seedErr) {
            console.error("Error seeding account", acct.code, seedErr);
          }
        });
      } else {
        // Sort accounts by hierarchical code numeric order
        items.sort((a, b) => {
          return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
        });
        setAccounts(items);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, "accounts"));

    // Default current month
    const currentDate = new Date();
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    setPayMonth(`${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`);

    return () => {
      unsubEntries();
      unsubPurchases();
      unsubSuppliers();
      unsubPayroll();
      unsubMaterials();
      unsubCosts();
      unsubInvoice();
      unsubAttendance();
      unsubOps();
      unsubAccounts();
    };
  }, []);

  // Sync piecework information when operator or rate changes
  useEffect(() => {
    if (!payOperatorId) {
      setCompletedOrdersCount(0);
      setCompletedGarmentsQty(0);
      return;
    }

    const fetchCompletedPieces = async () => {
      try {
        const qOrders = query(
          collection(db, "production_orders"),
          where("assignedOperatorId", "==", payOperatorId),
          where("status", "==", "Listo")
        );
        const qSnap = await getDocs(qOrders);
        let orderCount = 0;
        let piecesSum = 0;
        qSnap.forEach((docSnap) => {
          const data = docSnap.data();
          orderCount++;
          piecesSum += (data.quantity || 0);
        });
        setCompletedOrdersCount(orderCount);
        setCompletedGarmentsQty(piecesSum);
      } catch (err) {
        console.error("Error looking up productivity sheets: ", err);
      }
    };

    fetchCompletedPieces();
  }, [payOperatorId, payPieceworkRate]);

  // Alert notifier timers
  const showNotice = (msg: string, isErr = false) => {
    if (isErr) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 5000);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  // HANDLERS
  // Save Supplier
  const handleSaveSupplier = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!supName.trim() || !supRuc.trim()) {
      showNotice("Nombre y RUC son requeridos", true);
      return;
    }
    try {
      const id = `sup_${Date.now()}`;
      const payload: Supplier = {
        id,
        name: supName.trim(),
        ruc: supRuc.trim(),
        phone: supPhone.trim(),
        email: supEmail.trim(),
        address: supAddress.trim(),
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, "suppliers", id), payload);
      showSupplierModal(false);
      showNotice("Proveedor guardado correctamente");
      // Reset
      setSupName("");
      setSupRuc("");
      setSupPhone("");
      setSupEmail("");
      setSupAddress("");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "suppliers");
    }
  };

  // Save Purchase
  const handleSavePurchase = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!purInvoice.trim() || !purSupplierId || !purMaterialId || purQty <= 0 || purCost <= 0) {
      showNotice("Por favor, llena todos los campos de compra obligatorios con valores positivos.", true);
      return;
    }

    try {
      const supplier = suppliers.find((s) => s.id === purSupplierId);
      const rawMat = rawMaterials.find((m) => m.id === purMaterialId);

      if (!supplier || !rawMat) {
        showNotice("Proveedor u material seleccionado no existe.", true);
        return;
      }

      const id = `pur_${Date.now()}`;
      const subtotal = purQty * purCost;
      const iva = subtotal * 0.15; // 15% IVA Ecuador
      const total = subtotal + iva;

      const payload: Purchase = {
        id,
        invoiceNumber: purInvoice.trim(),
        supplierId: purSupplierId,
        supplierName: supplier.name,
        materialId: purMaterialId,
        materialName: rawMat.name,
        quantity: purQty,
        unitPrice: purCost,
        subtotal,
        iva,
        total,
        paymentStatus: purStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 1. Write Purchase document
      await setDoc(doc(db, "purchases", id), payload);

      // 2. Automatically INCREMENT raw material stock in Gestión de Inventario!
      const currentStock = rawMat.quantity || 0;
      const updatedStock = currentStock + purQty;
      await setDoc(doc(db, "raw_materials", purMaterialId), {
        ...rawMat,
        quantity: updatedStock,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 3. GENERATE AUTOMATIC DOUBLE-ENTRY JOURNAL ENTRY
      // Debit: 1.2 Inventario de Materia Prima (increases stock value)
      // Credit: Cash (1.1) or Accounts Payable (2.1)
      const creditAccount = purStatus === "Pagado" ? "1.1" : "2.1"; // 1.1 Caja, 2.1 Cuentas por pagar proveedores
      await autoRegisterJournalEntry(
        `Compra de material (${rawMat.name}) s/f ${purInvoice} - Prov: ${supplier.name}`,
        id,
        [
          { accountId: "1.2", debit: total, credit: 0 },
          { accountId: creditAccount, debit: 0, credit: total }
        ],
        payload.createdAt
      );

      setShowPurchaseModal(false);
      showNotice("Compra registrada con éxito. Stock de inventario e integración contable sincronizados!");

      // Reset
      setPurInvoice("");
      setPurQty(0);
      setPurCost(0);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "purchases");
    }
  };

  // --- AI OCR invoice handler methods ---
  const handleOcrFileSelection = async (file: File) => {
    if (!file) return;
    setOcrLoading(true);
    setOcrError(null);
    setOcrStep("upload");
    setOcrImageName(file.name);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Str = reader.result as string;
          const mimeType = file.type || "image/png";

          const res = await fetch("/api/ocr/invoice", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ imageBase64: base64Str, mimeType }),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Error al procesar la factura con IA.");
          }

          const data = await res.json();
          setOcrResult(data);

          // Attempt to match raw material to existing inventory item by name substring
          const suggestedName = data.purchase.materialSuggestedName.toLowerCase();
          const matMatch = rawMaterials.find(
            (rm) =>
              rm.name.toLowerCase().includes(suggestedName) ||
              suggestedName.includes(rm.name.toLowerCase())
          );

          if (matMatch) {
            setOcrSelectedMaterialId(matMatch.id);
            setOcrCreateNewMaterial(false);
          } else {
            setOcrSelectedMaterialId("");
            setOcrCreateNewMaterial(true);
          }

          setOcrPaymentStatus("Pagado");
          setOcrStep("preview");
          setOcrLoading(false);
        } catch (innerErr: any) {
          console.error(innerErr);
          setOcrError(innerErr.message || "Error al procesar la respuesta del servidor.");
          setOcrLoading(false);
        }
      };
      reader.onerror = () => {
        setOcrError("Error leyendo el archivo.");
        setOcrLoading(false);
      };
    } catch (err: any) {
      console.error(err);
      setOcrError(err.message || "Ocurrió un error inesperado al cargar la factura.");
      setOcrLoading(false);
    }
  };

  const handleConfirmOcrSave = async () => {
    if (!ocrResult) return;
    setOcrLoading(true);
    setOcrError(null);

    try {
      const { supplier: rawSup, purchase: rawPur } = ocrResult;

      // 1. Resolve Supplier
      let finalSupplierId = "";
      let finalSupplierName = rawSup.name;
      const matchedSup = suppliers.find((s) => s.ruc.trim() === rawSup.ruc.trim());

      if (matchedSup) {
        finalSupplierId = matchedSup.id;
        finalSupplierName = matchedSup.name;
      } else {
        // Create new Supplier automatically!
        finalSupplierId = `sup_${Date.now()}`;
        const newSupDoc: Supplier = {
          id: finalSupplierId,
          name: rawSup.name.trim(),
          ruc: rawSup.ruc.trim(),
          phone: rawSup.phone?.trim() || "",
          email: rawSup.email?.trim() || "",
          address: rawSup.address?.trim() || "",
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, "suppliers", finalSupplierId), newSupDoc);
      }

      // 2. Resolve Raw Material stock integration
      let finalMaterialId = "";
      let finalMaterialName = "";

      if (ocrCreateNewMaterial) {
        finalMaterialId = `raw_${Date.now()}`;
        finalMaterialName = rawPur.materialSuggestedName.trim();
        const newRawMaterial: RawMaterial = {
          id: finalMaterialId,
          name: finalMaterialName,
          category: ocrNewMaterialCategory,
          quantity: rawPur.quantity || 1,
          unit: ocrNewMaterialUnit,
          minStock: 10,
          costPerUnit: rawPur.unitPrice || rawPur.subtotal,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, "raw_materials", finalMaterialId), newRawMaterial);
      } else {
        const existingMat = rawMaterials.find((m) => m.id === ocrSelectedMaterialId);
        if (!existingMat) {
          throw new Error("Por favor, selecciona una materia prima existente o marca 'Crear nueva Materia Prima'.");
        }
        finalMaterialId = existingMat.id;
        finalMaterialName = existingMat.name;

        const updatedQty = (existingMat.quantity || 0) + (rawPur.quantity || 0);
        await setDoc(
          doc(db, "raw_materials", finalMaterialId),
          {
            ...existingMat,
            quantity: updatedQty,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      // 3. Save Purchase document
      const purchaseId = `pur_${Date.now()}`;
      const finalPurchaseDoc: Purchase = {
        id: purchaseId,
        invoiceNumber: rawPur.invoiceNumber.trim() || `S/F-${Date.now()}`,
        supplierId: finalSupplierId,
        supplierName: finalSupplierName,
        materialId: finalMaterialId,
        materialName: finalMaterialName,
        quantity: rawPur.quantity || 1,
        unitPrice: rawPur.unitPrice || rawPur.subtotal,
        subtotal: rawPur.subtotal,
        iva: rawPur.iva,
        total: rawPur.total,
        paymentStatus: ocrPaymentStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "purchases", purchaseId), finalPurchaseDoc);

      // 4. Generate balanced ledger double entry
      const creditAccount = ocrPaymentStatus === "Pagado" ? "1.1" : "2.1"; // 1.1 Caja/Bancos, 2.1 Cuentas por Pagar Proveedores
      const debitAccount = "1.2"; // 1.2 Inventario de Materia Prima

      await autoRegisterJournalEntry(
        `Compra de material (${finalMaterialName}) s/f ${finalPurchaseDoc.invoiceNumber} - Prov: ${finalSupplierName}`,
        purchaseId,
        [
          { accountId: debitAccount, debit: finalPurchaseDoc.total, credit: 0 },
          { accountId: creditAccount, debit: 0, credit: finalPurchaseDoc.total },
        ],
        finalPurchaseDoc.createdAt
      );

      setShowOcrModal(false);
      setOcrStep("upload");
      setOcrResult(null);
      setOcrLoading(false);
      showNotice("¡Factura cargada e integrada correctamente! Se registró el proveedor, la compra, actualización física de inventarios y partida doble contable.");
    } catch (err: any) {
      console.error(err);
      setOcrError(err.message || "Error guardando la información.");
      setOcrLoading(false);
    }
  };

  // Pay Supplier pending account
  const handlePaySupplierInFull = async (purchase: Purchase) => {
    if (!isAdmin) return;
    try {
      const updated: Purchase = {
        ...purchase,
        paymentStatus: "Pagado",
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, "purchases", purchase.id), updated);

      // Adjusting journal Entry
      // Debit: 2.1 Cuentas por Pagar Proveedores (decrease obligation)
      // Credit: 1.1 Caja y Bancos (decrease money)
      await autoRegisterJournalEntry(
        `Pago de cuenta pendiente s/f ${purchase.invoiceNumber} - Prov: ${purchase.supplierName}`,
        purchase.id,
        [
          { accountId: "2.1", debit: purchase.total, credit: 0 },
          { accountId: "1.1", debit: 0, credit: purchase.total }
        ],
        updated.updatedAt
      );

      showNotice("La cuenta por pagar ha sido liquidada y contabilizada correctamente.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "purchases");
    }
  };

  // --- SUBACCOUNT DYNAMIC CREATION & SUGGESTIONS ---
  const handleSelectParentAndSuggestCode = (parent: Account) => {
    setSelectedParentAccount(parent);
    setNewAccountName("");

    // Find children accounts
    const children = accounts.filter(a => a.parentCode === parent.code || a.code.startsWith(parent.code + "."));
    
    // Immediate children dots calculation (e.g. parent "1.1" -> child "1.1.XX" has 2 dots, parent has 1)
    const parentDotCount = parent.code.split(".").length;
    const immediateChildren = children.filter(c => {
      const childDotCount = c.code.split(".").length;
      return childDotCount === parentDotCount + 1;
    });

    let nextSeq = 1;
    if (immediateChildren.length > 0) {
      const numbers = immediateChildren.map(c => {
        const parts = c.code.split(".");
        const lastPart = parts[parts.length - 1];
        const parsed = parseInt(lastPart, 10);
        return isNaN(parsed) ? 0 : parsed;
      });
      const maxSeq = Math.max(...numbers);
      nextSeq = maxSeq + 1;
    }

    // Double digit pad for auxiliary accounts / subaccounts
    let suffix = String(nextSeq);
    if (parent.code.includes(".")) {
      suffix = String(nextSeq).padStart(2, '0');
    }

    setNewAccountCode(`${parent.code}.${suffix}`);
    setShowAddAccountModal(true);
  };

  const handleSaveSubaccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newAccountCode.trim() || !newAccountName.trim() || !selectedParentAccount) {
      showNotice("Por favor, llena todos los campos.", true);
      return;
    }

    const code = newAccountCode.trim();
    const exists = accounts.some(a => a.code === code);
    if (exists) {
      showNotice("Este código de cuenta ya está en uso. Elige otro secuencial.", true);
      return;
    }

    try {
      const newAcct: Account = {
        code,
        name: newAccountName.trim(),
        category: selectedParentAccount.category,
        parentCode: selectedParentAccount.code,
        isGroup: false,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "accounts", code), newAcct);
      setShowAddAccountModal(false);
      showNotice(`Cuenta '${code} - ${newAcct.name}' agregada con éxito!`);
      setNewAccountName("");
    } catch (err) {
      console.error("Error creating subaccount: ", err);
      showNotice("Error al guardar la subcuenta.", true);
    }
  };

  // --- MANUAL JOURNAL ENTRY METHODS ---
  const handleAddManualLine = () => {
    setManualLines([
      ...manualLines,
      { accountCode: "", debit: 0, credit: 0, detailConcept: "" }
    ]);
  };

  const handleRemoveManualLine = (index: number) => {
    if (manualLines.length <= 2) return;
    setManualLines(manualLines.filter((_, idx) => idx !== index));
  };

  const handleUpdateManualLine = (index: number, key: "accountCode" | "debit" | "credit" | "detailConcept", value: any) => {
    const updated = [...manualLines];
    if (key === "debit") {
      updated[index] = { ...updated[index], debit: Number(value) || 0, credit: 0 }; // one column per line rule
    } else if (key === "credit") {
      updated[index] = { ...updated[index], credit: Number(value) || 0, debit: 0 };
    } else {
      updated[index] = { ...updated[index], [key]: value };
    }
    setManualLines(updated);
  };

  const handleSaveManualJournalEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!manualConcept.trim()) {
      showNotice("El concepto del asiento es requirido.", true);
      return;
    }

    const sumDeb = manualLines.reduce((s, l) => s + (l.debit || 0), 0);
    const sumCred = manualLines.reduce((s, l) => s + (l.credit || 0), 0);
    
    if (sumDeb <= 0) {
      showNotice("El monto total del asiento debe ser mayor que cero.", true);
      return;
    }

    if (Math.abs(sumDeb - sumCred) >= 0.01) {
      showNotice(`Las sumas no cuadran. Debe: $${sumDeb.toFixed(2)} | Haber: $${sumCred.toFixed(2)}`, true);
      return;
    }

    const missingAccounts = manualLines.some(l => !l.accountCode);
    if (missingAccounts) {
      showNotice("Todas las líneas deben tener una cuenta contable seleccionada.", true);
      return;
    }

    try {
      const entryId = `asiento_${Date.now()}`;
      const formattedLines = manualLines.map(l => {
        const matchingAcct = accounts.find(a => a.code === l.accountCode);
        const name = matchingAcct ? matchingAcct.name : "Cuenta Desconocida";
        return {
          accountId: l.accountCode,
          accountName: name,
          debit: Number(l.debit.toFixed(2)),
          credit: Number(l.credit.toFixed(2))
        };
      });

      const payload: JournalEntry = {
        id: entryId,
        date: new Date(manualDate).toISOString(),
        concept: manualConcept.trim(),
        reference: manualReference.trim() || "Manual",
        lines: formattedLines,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "journal_entries", entryId), payload);
      
      // Cleanup
      setManualConcept("");
      setManualReference("");
      setManualDate(new Date().toISOString().substring(0, 10));
      setManualLines([
        { accountCode: "", debit: 0, credit: 0, detailConcept: "" },
        { accountCode: "", debit: 0, credit: 0, detailConcept: "" }
      ]);
      setShowJournalModal(false);
      showNotice("Asiento contable manual guardado con éxito.");
    } catch (err) {
      console.error("Error saving manual entry: ", err);
      showNotice("No se pudo guardar el asiento contable.", true);
    }
  };

  // Save Payroll payment
  const handleSavePayroll = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!payOperatorId || payBaseSalary < 0) {
      showNotice("Selecciona un operario y un salario base válido.", true);
      return;
    }

    try {
      const operator = operators.find((o) => o.uid === payOperatorId);
      if (!operator) {
        showNotice("Operario seleccionado no válido", true);
        return;
      }

      const id = `pay_${Date.now()}`;
      // Calculate Piecework Earnings
      const pieceworkEarnings = completedGarmentsQty * payPieceworkRate;
      const grossIncome = payBaseSalary + pieceworkEarnings;

      // Ecuador IESS:
      // Personal contribution: 9.45% (deducted from gross)
      const employeeIessDeduction = grossIncome * 0.0945;
      // Employer contribution obligation: 12.15% (company paid)
      const iessObligation = grossIncome * 0.1215;

      const totalPaid = grossIncome - employeeIessDeduction;

      const payload: PayrollPayment = {
        id,
        operatorId: payOperatorId,
        operatorName: operator.name,
        month: payMonth,
        baseSalary: payBaseSalary,
        pieceworkEarnings,
        iessObligation,
        employeeIessDeduction,
        totalPaid,
        paymentStatus: payStatus,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "payroll_payments", id), payload);

      // AUTOMATIC DOUBLE ENTRY LOGGING:
      // Debit: 5.1 Gasto Nómina Taller [Gross Income]
      // Debit: 5.3 Gasto Aporte Patronal IESS [Employer calculation 12.15%]
      // Credit: 2.2 Obligaciones IESS por Pagar [Total social security Personal 9.45% + Patronal 12.15% = 21.60%]
      // Credit: 1.1 Caja (if Pagado) OR 2.3 Nómina por Pagar (if Pendiente) [Net Paid value]
      const wageCreditAccount = payStatus === "Pagado" ? "1.1" : "2.3";
      await autoRegisterJournalEntry(
        `Nómina taller correspondiente a ${payMonth} - Operario: ${operator.name}`,
        id,
        [
          { accountId: "5.1", debit: grossIncome, credit: 0 },
          { accountId: "5.3", debit: iessObligation, credit: 0 },
          { accountId: "2.2", debit: 0, credit: employeeIessDeduction + iessObligation },
          { accountId: wageCreditAccount, debit: 0, credit: totalPaid }
        ],
        payload.createdAt
      );

      setShowPayrollModal(false);
      showNotice("Nómina guardada, deducciones del IESS calculadas y asiento contable automatizado registrado!");

      // Reset
      setPayOperatorId("");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "payroll_payments");
    }
  };

  // --- REPORT GENERATORS FOR LOSS & GAIN + BREAKEVEN ---
  const calculateFinancialMetrics = () => {
    // We compute directly from general ledger (journalEntries) for active, real-time professional consolidation!
    let invoiceSales = 0;
    let internalSales = 0;
    let costRawMaterials = 0;
    let costPayrollBase = 0;
    let costPayrollIess = 0;
    let minFixedCosts = 0;
    let totalPayrollExpenses = 0;

    if (journalEntries.length > 0) {
      journalEntries.forEach((entry) => {
        entry.lines.forEach((line) => {
          const accId = line.accountId;
          // Incomes: Credits of account 4.1 or subaccounts
          if (accId === "4.1" || accId.startsWith("4.1.")) {
            invoiceSales += (line.credit || 0);
          }
          // Incomes: Credits of account 4.2 or subaccounts
          else if (accId === "4.2" || accId.startsWith("4.2.")) {
            internalSales += (line.credit || 0);
          }
          // Other incomes starting with 4
          else if (accId.startsWith("4.") && accId !== "4.1" && accId !== "4.2") {
            internalSales += (line.credit || 0);
          }
          
          // Cost of Raw Materials: Debits of account 1.2 or 1.1.02 or 5.2 or subaccounts
          else if (accId === "1.2" || accId.startsWith("1.2.") || accId === "5.2" || accId.startsWith("5.2.")) {
            costRawMaterials += (line.debit || 0);
          }
          
          // Payroll base: Debits of account 5.1/subaccounts
          else if (accId === "5.1" || accId.startsWith("5.1.")) {
            costPayrollBase += (line.debit || 0);
          }
          // Payroll IESS obligation: Debits of account 5.3/subaccounts
          else if (accId === "5.3" || accId.startsWith("5.3.")) {
            costPayrollIess += (line.debit || 0);
          }

          // Fixed costs: Debits of account 6.1 (dynamic) or 5.4 or starting with 6. or 5.4
          else if (accId === "6.1" || accId.startsWith("6.1.") || accId === "5.4" || accId.startsWith("5.4.") || accId.startsWith("6.")) {
            minFixedCosts += (line.debit || 0);
          }
        });
      });
      
      // If we don't have recorded fixed costs in ledger yet, fallback to the operational overheads
      if (minFixedCosts === 0) {
        const operationalOverheads = fixedCosts.reduce((sum, fc) => {
          const amt = fc.amount || 0;
          return sum + (fc.period === "Mensual" ? amt : amt / 12);
        }, 0);
        minFixedCosts = operationalOverheads > 0 ? operationalOverheads : 1250;
      }
      
      totalPayrollExpenses = costPayrollBase + costPayrollIess;
    } else {
      // Fallback to source document computation if ledger is completely empty
      invoiceSales = invoices
        .filter((inv) => inv.status === "AUTORIZADO")
        .reduce((sum, inv) => sum + (inv.total || 0), 0);
      internalSales = invoices
        .filter((inv) => inv.status === "RECIBO_INTERNO")
        .reduce((sum, inv) => sum + (inv.total || 0), 0);
      costRawMaterials = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
      
      const pBase = payrollPayments.reduce((sum, p) => sum + (p.baseSalary || 0), 0);
      const pPiece = payrollPayments.reduce((sum, p) => sum + (p.pieceworkEarnings || 0), 0);
      const pIess = payrollPayments.reduce((sum, p) => sum + (p.iessObligation || 0), 0);
      totalPayrollExpenses = pBase + pPiece + pIess;

      const operationalOverheads = fixedCosts.reduce((sum, fc) => {
        const amt = fc.amount || 0;
        return sum + (fc.period === "Mensual" ? amt : amt / 12);
      }, 0);
      minFixedCosts = operationalOverheads > 0 ? operationalOverheads : 1250;
    }

    const totalRevenues = invoiceSales + internalSales;
    const grandTotalExpenses = costRawMaterials + totalPayrollExpenses + minFixedCosts;
    const netProfit = totalRevenues - grandTotalExpenses;

    return {
      invoiceSales,
      internalSales,
      totalRevenues,
      costRawMaterials,
      totalPayrollExpenses,
      minFixedCosts,
      grandTotalExpenses,
      netProfit,
    };
  };

  const metrics = calculateFinancialMetrics();

  // Break-even simulation dataset generator
  const generateBreakevenChartData = () => {
    const fixed = metrics.minFixedCosts + (payrollPayments.reduce((sum, p) => sum + (p.baseSalary || 0), 0));
    // Estimate average garment price & average variable costs per garment
    const avgGarmentPrice = 28.5; // average price
    const avgVariableCost = 12.0; // raw material + productivity labor avg
    const contributionMargin = avgGarmentPrice - avgVariableCost;
    
    // Formula: BEP_Units = Fixed_Costs / Margin
    const bepUnits = Math.ceil(fixed / contributionMargin);

    const dataPoints = [];
    const stepSize = Math.max(10, Math.ceil(bepUnits * 2 / 10));

    for (let q = 0; q <= bepUnits * 2; q += stepSize) {
      const revenue = q * avgGarmentPrice;
      const variableCosts = q * avgVariableCost;
      const totalCost = fixed + variableCosts;
      dataPoints.push({
        quantity: q,
        "Ingresos Totales ($)": Number(revenue.toFixed(0)),
        "Costos Totales ($)": Number(totalCost.toFixed(0)),
        "Costos Fijos ($)": Number(fixed.toFixed(0)),
        "Punto de Equilibrio ($)": Number((bepUnits * avgGarmentPrice).toFixed(0))
      });
    }

    return {
      chartData: dataPoints,
      bepUnits,
      bepSales: bepUnits * avgGarmentPrice,
      fixedCostTotal: fixed
    };
  };

  const bepResult = generateBreakevenChartData();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-96">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-emerald-500 animate-spin mb-4" />
        <p className="text-slate-500 text-sm">Cargando módulos de contabilidad y balances...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="accounting-workspace">
      {/* Tab Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Landmark className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contabilidad y Finanzas</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Asientos automatizados de Libro Diario, liquidación de nóminas, stock de compras y reportes de rentabilidad.
          </p>
        </div>

        {/* Action Controls for Admin */}
        <div className="flex flex-wrap gap-2">
          {subTab === "purchases" && isAdmin && (
            <>
              <button
                onClick={() => {
                  setOcrStep("upload");
                  setOcrResult(null);
                  setOcrError(null);
                  setShowOcrModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white rounded-xl shadow-md transition font-medium text-sm animate-pulse-subtle"
                id="scan-invoice-btn"
              >
                <Sparkles className="w-4 h-4 text-teal-100" />
                <span>Escanear Factura con IA</span>
              </button>
              <button
                onClick={() => setShowSupplierModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-medium text-sm border border-slate-200"
                id="add-supplier-btn"
              >
                <Users className="w-4 h-4" />
                <span>Nuevo Proveedor</span>
              </button>
              <button
                onClick={() => setShowPurchaseModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition font-medium text-sm"
                id="add-purchase-btn"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Compra Insumos</span>
              </button>
            </>
          )}

          {subTab === "payroll" && isAdmin && (
            <button
              onClick={() => setShowPayrollModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition font-medium text-sm"
              id="add-payroll-btn"
            >
              <Plus className="w-4 h-4" />
              <span>Ejecutar Pago Nómina</span>
            </button>
          )}
        </div>
      </div>

      {/* General info alerts */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-800 text-sm animate-fade-in" id="success-bar">
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-800 text-sm animate-fade-in" id="error-bar">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Sub Navigation Tabs */}
      <div className="flex border-b border-slate-100 p-1 bg-slate-100/50 rounded-xl max-w-2xl" id="accounting-nav-tabs">
        <button
          onClick={() => setSubTab("ledger")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
            subTab === "ledger"
              ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Libro Diario</span>
        </button>
        <button
          onClick={() => setSubTab("purchases")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
            subTab === "purchases"
              ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Compras e Insumos</span>
        </button>
        <button
          onClick={() => setSubTab("payroll")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
            subTab === "payroll"
              ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Nómina del Taller</span>
        </button>
        <button
          onClick={() => setSubTab("reports")}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
            subTab === "reports"
              ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Estados Financieros</span>
        </button>
      </div>

      {/* SUBTAB WINDOWS */}
      {/* 1. JOURNAL LEDGER */}
      {subTab === "ledger" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="ledger-grid">
          {/* Plan de cuentas */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-slate-800 border-b border-slate-100 pb-3 justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-slate-500" />
                <h2>Catálogo Plan de Cuentas</h2>
              </div>
            </div>
            <div className="space-y-4 text-xs max-h-[600px] overflow-y-auto pr-1">
              {["Activo", "Pasivo", "Patrimonio", "Ingresos", "Costos", "Gastos"].map((cat) => {
                // Find matching accounts (either exactly group or starting with its prefix)
                const categoryAccounts = accounts.filter((acct) => acct.category === cat);
                return (
                  <div key={cat} className="space-y-1">
                    <h3 className="font-bold text-slate-700 uppercase tracking-wide text-[10px] bg-slate-50 px-2 py-1 rounded">
                      {cat}
                    </h3>
                    <div className="divide-y divide-slate-50 pl-1">
                      {categoryAccounts.length === 0 ? (
                        <div className="py-2 text-[10px] text-slate-400 italic">Preloading catalog...</div>
                      ) : (
                        categoryAccounts.map((acct) => (
                          <div key={acct.code} className="py-1.5 flex items-center justify-between gap-1 hover:bg-slate-50/50 px-1 rounded">
                            <div className="flex items-center gap-2 truncate flex-1">
                              <span className={`font-mono font-semibold shrink-0 ${acct.isGroup ? "text-slate-800 font-bold" : "text-slate-500"}`}>
                                {acct.code}
                              </span>
                              <span className={`text-slate-600 truncate text-[11px] ${acct.isGroup ? "font-bold text-slate-900" : "font-medium"}`}>
                                {acct.name}
                              </span>
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleSelectParentAndSuggestCode(acct)}
                                className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition shrink-0"
                                title={`Agregar Subcuenta secuencial bajo ${acct.name}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* List of journal entries */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <Clipboard className="w-5 h-5 text-slate-500" />
                <h2>Asientos del Libro Diario General</h2>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-bold">
                  {journalEntries.length} Registros
                </span>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowJournalModal(true)}
                  className="p-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition duration-150"
                  id="btn-nuevo-asiento-manual"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo Asiento Manual</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-100 font-medium text-slate-500">
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Concepto Transacción</th>
                    <th className="py-3 px-4 text-right">Débito total</th>
                    <th className="py-3 px-4 text-right">Crédito total</th>
                    <th className="py-3 px-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {journalEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                        Sin asientos contables en este período. Realiza una venta en Facturación o compra para generarlas automáticamente, o registra uno Manual.
                      </td>
                    </tr>
                  ) : (
                    journalEntries.map((entry) => {
                      // Sum absolute debits
                      const debTotal = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
                      const credTotal = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/50 transition duration-100">
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-500">
                            {new Date(entry.date).toLocaleDateString("es-EC", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-700 max-w-sm truncate text-left">
                            {entry.concept}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600 text-right">
                            ${debTotal.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 text-right">
                            ${credTotal.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedEntry(entry)}
                              className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition duration-75 text-[10px] font-bold flex items-center justify-center gap-1 mx-auto"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Ver Partida</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. PURCHASES AND SUPPLIERS */}
      {subTab === "purchases" && (
        <div className="space-y-6" id="purchases-tab">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Total Compras Insumo</p>
                <h3 className="text-xl font-bold text-slate-800 font-mono">
                  ${purchases.reduce((s, p) => s + p.total, 0).toFixed(2)}
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Cuentas por Pagar (Pendientes)</p>
                <h3 className="text-xl font-bold text-amber-600 font-mono">
                  ${purchases.filter(p => p.paymentStatus === "Pendiente").reduce((s, p) => s + p.total, 0).toFixed(2)}
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Proveedores Registrados</p>
                <h3 className="text-xl font-bold text-emerald-600 font-mono">
                  {suppliers.length} Activos
                </h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Suppliers List */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
              <div className="font-semibold text-slate-800 border-b border-slate-100 pb-3 flex justify-between items-center">
                <h3>Proveedores Oficiales</h3>
                <span className="text-[10px] text-slate-400">Padrón Único</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto pr-1">
                {suppliers.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-10 font-medium">No hay proveedores registrados aún.</p>
                ) : (
                  suppliers.map((s) => (
                    <div key={s.id} className="py-3 text-xs text-left">
                      <p className="font-bold text-slate-700">{s.name}</p>
                      <p className="text-slate-400 font-mono text-[10px] mt-0.5">RUC: {s.ruc}</p>
                      <p className="text-slate-500 mt-1">Llamar: {s.phone || "-"}</p>
                      <p className="text-slate-400 mt-0.5 truncate">{s.address || "-"}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Purchases register invoices */}
            <div className="xl:col-span-2 bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
              <div className="font-semibold text-slate-800 border-b border-slate-100 pb-3">
                <h3>Bitácora de Facturas de Compra (Asientos e Inventarios)</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 font-medium text-slate-500">
                      <th className="py-3 px-3">Nro Factura</th>
                      <th className="py-3 px-3">Proveedor</th>
                      <th className="py-3 px-3">Materia Prima</th>
                      <th className="py-3 px-3 text-center">Cantidad</th>
                      <th className="py-3 px-3 text-right">Total c/IVA</th>
                      <th className="py-3 px-3 text-center">Estado</th>
                      <th className="py-3 px-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {purchases.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                          Sin facturas de compra cargadas en contabilidad.
                        </td>
                      </tr>
                    ) : (
                      purchases.map((pur) => (
                        <tr key={pur.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-3 px-3 font-mono font-bold text-slate-700">{pur.invoiceNumber}</td>
                          <td className="py-3 px-3 font-medium text-slate-600 text-left">{pur.supplierName}</td>
                          <td className="py-3 px-3 text-left">
                            <span className="font-bold text-slate-700">{pur.materialName}</span>
                          </td>
                          <td className="py-3 px-3 text-center font-semibold text-slate-700 font-mono">{pur.quantity}</td>
                          <td className="py-3 px-3 text-right font-semibold font-mono text-slate-800">
                            ${pur.total.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              pur.paymentStatus === "Pagado"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}>
                              {pur.paymentStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {pur.paymentStatus === "Pendiente" && isAdmin && (
                              <button
                                onClick={() => handlePaySupplierInFull(pur)}
                                className="p-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-[10px] font-bold transition duration-75"
                              >
                                Pagar Proveedor
                              </button>
                            )}
                            {pur.paymentStatus === "Pagado" && (
                              <span className="text-[10px] text-slate-400 font-semibold flex items-center justify-center gap-0.5">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                Conciliado
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. WORKSHOP PAYROLL */}
      {subTab === "payroll" && (
        <div className="space-y-6" id="payroll-tab">
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Total Operarios Conectados</p>
                <h3 className="text-xl font-bold text-slate-800 font-mono">
                  {operators.length} Colaboradores
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Último Rol Consolidado</p>
                <h3 className="text-xl font-bold text-emerald-600 font-mono">
                  ${payrollPayments.reduce((s, p) => s + p.totalPaid, 0).toFixed(2)}
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Obligaciones Seg. Social (IESS)</p>
                <h3 className="text-xl font-bold text-purple-600 font-mono">
                  ${(payrollPayments.reduce((s, p) => s + (p.iessObligation || 0) + (p.employeeIessDeduction || 0), 0)).toFixed(2)}
                </h3>
              </div>
            </div>
          </div>

          {/* Historical roll payments */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-800">Control de Nóminas Emitidas en el Taller</h3>
              <span className="text-[10px] text-slate-400">Seguridad Social Directa (Ecuador)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 font-medium text-slate-500">
                    <th className="py-3 px-3">Fecha de Emisión</th>
                    <th className="py-3 px-3">Colaborador / Operario</th>
                    <th className="py-3 px-3">Mes Declarado</th>
                    <th className="py-3 px-3 text-right">Sueldo Fijo ($)</th>
                    <th className="py-3 px-3 text-right">Destajo/Prod. ($)</th>
                    <th className="py-3 px-3 text-right">Deduc. IESS (9.45%)</th>
                    <th className="py-3 px-3 text-right">Aporte Patronal (12.15%)</th>
                    <th className="py-3 px-3 text-right">Neto Pagado ($)</th>
                    <th className="py-3 px-3 text-center">Estado Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {payrollPayments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                        Ningún rol de pago emitido aún en el taller.
                      </td>
                    </tr>
                  ) : (
                    payrollPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 px-3 font-mono text-slate-400">
                          {new Date(p.createdAt).toLocaleDateString("es-EC")}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-700 text-left">{p.operatorName}</td>
                        <td className="py-3 px-3 font-semibold text-slate-600 uppercase text-left">{p.month}</td>
                        <td className="py-3 px-3 text-right font-mono">${(p.baseSalary || 0).toFixed(2)}</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">
                          ${(p.pieceworkEarnings || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-red-500">
                          -${(p.employeeIessDeduction || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-indigo-500">
                          ${(p.iessObligation || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                          ${p.totalPaid.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            p.paymentStatus === "Pagado"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {p.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. FINANCIAL STATEMENTS & BEP */}
      {subTab === "reports" && (
        <div className="space-y-6" id="reports-tab">
          {/* Income Statement sheet */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Balance state */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-6 shadow-sm">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-lg">Estado de Pérdidas y Ganancias (P&G)</h3>
                <p className="text-xs text-slate-400">Calculado automáticamente en tiempo real cruzando compras, nóminas e ingresos de facturas.</p>
              </div>

              {/* Sheet line items */}
              <div className="space-y-4 text-sm">
                {/* INCOMES */}
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-slate-800 border-b border-slate-100 pb-1 uppercase tracking-wide text-xs">
                    <span>Ingresos Operativos</span>
                    <span>Consolidado</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-4">
                    <span>Ventas Facturadas SRI (12%/15%)</span>
                    <span className="font-mono text-slate-700">${metrics.invoiceSales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-4 pb-2">
                    <span>Ventas Internas (Notas de Venta)</span>
                    <span className="font-mono text-slate-700">${metrics.internalSales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl text-left">
                    <span>INGRESOS BRUTOS TOTALES</span>
                    <span className="font-mono">${metrics.totalRevenues.toFixed(2)}</span>
                  </div>
                </div>

                {/* EXPENSES */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between font-bold text-slate-800 border-b border-slate-100 pb-1 uppercase tracking-wide text-xs">
                    <span>Costos y Gastos Operativos</span>
                    <span>Consolidado</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-4">
                    <span>Costos de Materias Primas e Insumos</span>
                    <span className="font-mono text-slate-700">${metrics.costRawMaterials.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-4">
                    <span>Gastos de Nómina y Destajos de Operarios</span>
                    <span className="font-mono text-slate-700">${metrics.totalPayrollExpenses.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 pl-4 pb-2">
                    <span>Gastos Administrativos / Costos Fijos</span>
                    <span className="font-mono text-slate-700">${metrics.minFixedCosts.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-red-600 bg-red-50/50 px-3 py-2 rounded-xl text-left">
                    <span>COSTOS TOTALES DEDUCIBLES</span>
                    <span className="font-mono">${metrics.grandTotalExpenses.toFixed(2)}</span>
                  </div>
                </div>

                {/* MARGIN RESULT */}
                <div className="pt-4">
                  <div className={`p-4 rounded-2xl border flex justify-between items-center ${
                    metrics.netProfit >= 0
                      ? "bg-emerald-500/10 border-emerald-300 text-emerald-800"
                      : "bg-red-500/10 border-red-300 text-red-800"
                  }`}>
                    <div>
                      <h4 className="font-bold text-base">Utilidad / Pérdida Neta</h4>
                      <p className="text-[10px] opacity-75">Resultado neto del periodo analizado</p>
                    </div>
                    <span className="font-mono text-2xl font-bold">
                      {metrics.netProfit >= 0 ? "+" : ""}${metrics.netProfit.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Breakeven Chart visual */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-6 shadow-sm">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-lg">Gráfico del Punto de Equilibrio</h3>
                <p className="text-xs text-slate-400">Cálculo dinámico basado en costos declarados. Muestra el nivel mínimo de ventas textiles para ser rentable (promedio $28.50/prenda).</p>
              </div>

              {/* Chart statistics */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Costos Fijos</p>
                  <p className="text-xs font-bold text-slate-700 font-mono mt-1">${bepResult.fixedCostTotal.toFixed(0)}</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Volumen Crítico</p>
                  <p className="text-xs font-bold text-amber-600 font-mono mt-1">{bepResult.bepUnits} prendas</p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Venta Crítica</p>
                  <p className="text-xs font-bold text-emerald-600 font-mono mt-1">${bepResult.bepSales.toFixed(0)}</p>
                </div>
              </div>

              {/* Chart container */}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bepResult.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="quantity" stroke="#94a3b8" fontSize={9} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "12px", border: "1px solid #e2e8f0" }} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Line type="monotone" dataKey="Ingresos Totales ($)" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Costos Totales ($)" stroke="#ef4444" strokeWidth={3} />
                    <Line type="monotone" dataKey="Costos Fijos ($)" stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 5" />
                    <ReferenceLine x={bepResult.bepUnits} stroke="#f59e0b" strokeWidth={2} label={{ value: "Punto Eq.", position: "top", fill: "#f59e0b", fontSize: 9 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- POPUP MODAL DIALOGS --- */}

      {/* 1. SUPPLIER REGISTRY MODAL */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-fade-in" id="supplier-modal-window">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold">Agregar Proveedor de Materia Prima</h3>
              </div>
              <button
                onClick={() => setShowSupplierModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-4 text-xs text-left">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">Razon Social / Nombre Proveedor *</label>
                <input
                  type="text"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500"
                  placeholder="Ej: Distribuidora Textil Otavalo"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">RUC / Cédula *</label>
                <input
                  type="text"
                  value={supRuc}
                  onChange={(e) => setSupRuc(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono"
                  placeholder="Ej: 1003487569001"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">Teléfono Móvil</label>
                  <input
                    type="text"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono"
                    placeholder="Ej: 0984512344"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">Correo Electrónico</label>
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500"
                    placeholder="example@mail.com"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">Dirección de Despacho</label>
                <input
                  type="text"
                  value={supAddress}
                  onChange={(e) => setSupAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500"
                  placeholder="Ej: Av. Bolívar e Imbabura, Otavalo"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition font-medium"
                >
                  Inscribir Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI OCR INVOICE SCANNING MODAL */}
      {showOcrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full overflow-hidden animate-fade-in my-8 max-h-[90vh] flex flex-col" id="ocr-modal-window">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-400/20 text-indigo-400">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Escáner Automatizado de Facturas con IA</h3>
                  <p className="text-[10px] text-indigo-200">Impulsado por Gemini - Contabilidad Textil Inteligente</p>
                </div>
              </div>
              <button
                onClick={() => setShowOcrModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-6 flex-1 text-xs">
              {ocrError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-left">
                    <p className="font-bold">Error al procesar la factura</p>
                    <p>{ocrError}</p>
                  </div>
                </div>
              )}

              {ocrLoading ? (
                <div className="py-16 px-6 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full border-4 border-indigo-50 border-t-indigo-600 animate-spin" />
                    <Sparkles className="w-8 h-8 text-indigo-500 absolute top-6 left-6 animate-pulse" />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <p className="font-bold text-sm text-slate-800">Analizando Comprobante con Inteligencia Artificial...</p>
                    <p className="text-xs text-slate-500">
                      Gemini está realizando una lectura óptica estructurada sobre el archivo <span className="font-semibold text-indigo-600 font-mono">"{ocrImageName}"</span>.
                    </p>
                    <p className="text-[11px] text-slate-400 animate-pulse">
                      Identificando RUC, calculando subtotal 15%, segregando IVA y preparando el asiento de partida doble...
                    </p>
                  </div>
                </div>
              ) : ocrStep === "upload" ? (
                /* Drag and drop panel */
                <div className="space-y-6 py-4">
                  <div className="text-center space-y-1.5 max-w-xl mx-auto">
                    <h4 className="text-sm font-semibold text-slate-800">Cargue o Arrastre su Comprobante de Compra</h4>
                    <p className="text-slate-500 leading-relaxed text-[11px]">
                      Sube una fotografía o captura legible de tu factura física (proveedores de telas, hilos, botones u otros insumos). El sistema dará de alta automáticamente los datos requeridos.
                    </p>
                  </div>

                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleOcrFileSelection(e.dataTransfer.files[0]);
                      }
                    }}
                    className="border-2 border-dashed rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4 transition-all border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-55"
                  >
                    <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                      <Upload className="w-8 h-8 animate-bounce" />
                    </div>
                    <div className="space-y-1 text-slate-600">
                      <p className="font-semibold text-[13px]">Arrastre la imagen de la factura aquí</p>
                      <p className="text-slate-400">formatos soportados: PNG, JPG, JPEG, WEBP</p>
                    </div>

                    <div className="relative pt-2">
                      <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-xs shadow-md transition cursor-pointer select-none">
                        <span>Seleccionar Archivo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleOcrFileSelection(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex gap-3 text-slate-500 text-left leading-relaxed">
                    <Calculator className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-[11px]">
                      <p className="font-semibold text-slate-700">Flujo automatizado de inventarios y asientos:</p>
                      <p>1. <span className="font-medium text-slate-700">Proveedor</span>: Si el RUC no existe en el registro del taller, se registra por primera vez al instante.</p>
                      <p>2. <span className="font-medium text-slate-700">Stock de Materiales</span>: Se asocia a un rollo/cono existente de material para sumar metraje, ó se crea una nueva materia prima.</p>
                      <p>3. <span className="font-medium text-slate-700">Libro Diario</span>: Se genera el asiento de partida doble afectando la cuenta de inventarios y de caja (si es pagada) o proveedores (si es con deuda).</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* OCR output preview page */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left my-2 animate-fade-in">
                  {/* Left block - Extracted facts */}
                  <div className="space-y-5 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                    <div className="border-b border-slate-200 pb-2">
                      <h4 className="font-bold text-slate-800 text-[13px] flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        Datos Extraídos por el Escáner
                      </h4>
                    </div>

                    {/* Supplier info */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-500">PROVEEDOR</span>
                        {suppliers.some((s) => s.ruc.trim() === ocrResult?.supplier.ruc.trim()) ? (
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] font-bold border border-emerald-100">
                            ✓ PROVEEDOR EXISTENTE
                          </span>
                        ) : (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[9px] font-bold border border-blue-100">
                            + REGISTRAR COMO NUEVO
                          </span>
                        )}
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5 font-sans">
                        <p className="font-bold text-slate-800">{ocrResult?.supplier.name}</p>
                        <p className="text-[11px] font-mono text-slate-500">RUC Ecuador: {ocrResult?.supplier.ruc}</p>
                        {ocrResult?.supplier.address && <p className="text-slate-400 text-[10px]">📍 {ocrResult?.supplier.address}</p>}
                        {(ocrResult?.supplier.phone || ocrResult?.supplier.email) && (
                          <p className="text-slate-400 text-[10px] truncate">
                            📞 {ocrResult?.supplier.phone || "-"} | ✉ {ocrResult?.supplier.email || "-"}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Invoice detail facts */}
                    <div className="space-y-2">
                      <span className="font-semibold text-slate-500">DETALLE DE LA COMPRA</span>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 font-sans">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-medium">Factura Nro</p>
                            <p className="font-mono font-bold text-slate-700">{ocrResult?.purchase.invoiceNumber}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-medium">Fecha Emisión</p>
                            <p className="font-semibold text-slate-700">{ocrResult?.purchase.date || new Date().toISOString().substring(0, 10)}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-medium">Insumo / Concepto Detectado</p>
                          <p className="font-medium text-slate-700">{ocrResult?.purchase.materialSuggestedName}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center text-[11px]">
                          <div>
                            <p className="text-slate-400 text-[10px]">Cant. Unit.</p>
                            <p className="font-bold text-slate-700">{ocrResult?.purchase.quantity || 1}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-[10px]">Costo Unit.</p>
                            <p className="font-bold text-slate-700">${(ocrResult?.purchase.unitPrice || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-[10px]">Subtotal</p>
                            <p className="font-bold text-slate-700">${(ocrResult?.purchase.subtotal || 0).toFixed(2)}</p>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-[11px]">
                          <span className="text-slate-400">IVA 15%</span>
                          <span className="font-bold text-slate-700">${(ocrResult?.purchase.iva || 0).toFixed(2)}</span>
                        </div>

                        <div className="border-t-2 border-double border-slate-200 pt-2 flex justify-between items-center text-sm">
                          <span className="font-bold text-slate-900">Total Factura</span>
                          <span className="font-mono font-black text-indigo-600">${(ocrResult?.purchase.total || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right block - ERP Sync parameters */}
                  <div className="space-y-5 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="border-b border-slate-200 pb-2">
                        <h4 className="font-bold text-slate-800 text-[13px] flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          Parámetros de Entrada ERP
                        </h4>
                      </div>

                      {/* Step A - Material Assignment */}
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3 shadow-inner">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-700 text-[11px]">Afectación de Stock Físico</span>
                        </div>

                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                            <input
                              type="radio"
                              name="ocrMaterialMode"
                              checked={!ocrCreateNewMaterial}
                              onChange={() => setOcrCreateNewMaterial(false)}
                              disabled={rawMaterials.length === 0}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Asociar a material existente</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                            <input
                              type="radio"
                              name="ocrMaterialMode"
                              checked={ocrCreateNewMaterial}
                              onChange={() => setOcrCreateNewMaterial(true)}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Crear nueva Materia Prima</span>
                          </label>
                        </div>

                        {!ocrCreateNewMaterial ? (
                          <div className="space-y-1 animate-fade-in">
                            <label className="text-[10px] text-slate-400 font-semibold block">Selecciona la Materia Prima del Inventario:</label>
                            <select
                              value={ocrSelectedMaterialId}
                              onChange={(e) => setOcrSelectedMaterialId(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl p-2 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              required={!ocrCreateNewMaterial}
                            >
                              <option value="">-- Elige Material para Aumento de Stock o Kg --</option>
                              {rawMaterials.map((rm) => (
                                <option key={rm.id} value={rm.id}>
                                  {rm.name} - ({rm.quantity} {rm.unit} disponibles)
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/50 animate-fade-in text-[10px]">
                            <div className="space-y-1">
                              <label className="text-slate-500 font-bold block">Categoría de Materia:</label>
                              <select
                                value={ocrNewMaterialCategory}
                                onChange={(e) => setOcrNewMaterialCategory(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-indigo-500"
                              >
                                <option value="Tela">Telas / Tejidos</option>
                                <option value="Hilo">Hilos</option>
                                <option value="Botones">Botones / Herrajes</option>
                                <option value="Accesorios">Accesorios / Cintas</option>
                                <option value="Otro">Otros Insumos</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-slate-500 font-bold block">Unidad Física:</label>
                              <select
                                value={ocrNewMaterialUnit}
                                onChange={(e) => setOcrNewMaterialUnit(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-indigo-500"
                              >
                                <option value="metros">Metros (m)</option>
                                <option value="conos">Conos</option>
                                <option value="unidades">Unidades (ud)</option>
                                <option value="kilogramos">Kilogramos (kg)</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Step B - Payment Status */}
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-2">
                        <span className="font-bold text-slate-700 text-[11px] block">Condición de Pago de Factura</span>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                            <input
                              type="radio"
                              name="ocrPaymentStatus"
                              checked={ocrPaymentStatus === "Pagado"}
                              onChange={() => setOcrPaymentStatus("Pagado")}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Al Contado / Liquidado (Caja 1.1)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                            <input
                              type="radio"
                              name="ocrPaymentStatus"
                              checked={ocrPaymentStatus === "Pendiente"}
                              onChange={() => setOcrPaymentStatus("Pendiente")}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>A Crédito / Proveedores (Pasivo 2.1)</span>
                          </label>
                        </div>
                      </div>

                      {/* Step C - Recommended Ledger Double Entry */}
                      <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl border border-slate-800 space-y-2 font-mono text-[10px]">
                        <span className="font-sans font-bold text-indigo-400 text-[11px] block">PREVISIÓN DE ASIENTO CONTABLE AUTOMÁTICO</span>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="text-left pb-1 font-sans">Cuenta Contable</th>
                              <th className="text-right pb-1 pr-2 font-sans">Debe (+)</th>
                              <th className="text-right pb-1 font-sans">Haber (-)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            <tr>
                              <td className="py-1 text-slate-200">1.2 Inventario de Materia Prima</td>
                              <td className="py-1 text-right text-emerald-400 pr-2">${(ocrResult?.purchase.total || 0).toFixed(2)}</td>
                              <td className="py-1 text-right text-slate-600">$0.00</td>
                            </tr>
                            <tr>
                              <td className="py-1 text-slate-200">
                                {ocrPaymentStatus === "Pagado" ? "1.1 Caja y Bancos" : "2.1 Proveedores C/P"}
                              </td>
                              <td className="py-1 text-right text-slate-600 pr-2">$0.00</td>
                              <td className="py-1 text-right text-red-400">${(ocrResult?.purchase.total || 0).toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                        <p className="text-[9px] text-slate-400 font-sans italic leading-relaxed pt-1.5 border-t border-slate-800/60 text-left">
                          <span className="font-bold not-italic">Razón de Selección:</span> {ocrResult?.accounting.reasoning}
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 italic text-center pt-2">
                      💡 El sistema creará en instantes el proveedor, la compra fiscal en la bitácora, actualizará existencias e ingresará el Libro Diario en una sola acción.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-5 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowOcrModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl transition font-semibold"
                disabled={ocrLoading}
              >
                Cancelar
              </button>
              {ocrStep === "preview" && (
                <button
                  type="button"
                  onClick={handleConfirmOcrSave}
                  className="px-5 py-2 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white rounded-xl shadow-md transition font-bold"
                  disabled={ocrLoading}
                >
                  Confirmar e Integrar en ERP
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. INGRESO COMPRA INSUMOS MODAL */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden animate-fade-in" id="purchase-modal-window">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold">Ingreso de Compra (Asientos y Stock)</h3>
              </div>
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-6 space-y-4 text-xs text-left">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">Número de Factura de Compra *</label>
                <input
                  type="text"
                  value={purInvoice}
                  onChange={(e) => setPurInvoice(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono font-bold"
                  placeholder="Ej: 001-002-0004512"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">Selecciona Proveedor *</label>
                <select
                  value={purSupplierId}
                  onChange={(e) => setPurSupplierId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 bg-white"
                  required
                >
                  <option value="">-- Selecciona un proveedor registrado --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (RUC: {s.ruc})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">Sincronizar Producto / Materia Prima *</label>
                <select
                  value={purMaterialId}
                  onChange={(e) => setPurMaterialId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 bg-white"
                  required
                >
                  <option value="">-- Selecciona materia prima para incrementar stock --</option>
                  {rawMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.category} - Stock Act: {m.quantity} {m.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">Cantidad Comprada</label>
                  <input
                    type="number"
                    value={purQty}
                    onChange={(e) => setPurQty(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono font-bold"
                    placeholder="Ej: 100"
                    min={1}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">Costo Unitario ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={purCost}
                    onChange={(e) => setPurCost(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono font-bold"
                    placeholder="Ej: 4.50"
                    min={0.01}
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-500 text-[10px] uppercase">Total Cost + 15% IVA</p>
                  <p className="text-sm font-black text-slate-800 font-mono">
                    ${((purQty * purCost) * 1.15).toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-medium">Bases: subtotal ${(purQty * purCost).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-semibold text-slate-600 block">Estado del Pago</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="payment_status"
                      checked={purStatus === "Pagado"}
                      onChange={() => setPurStatus("Pagado")}
                      className="text-emerald-500 cursor-pointer"
                    />
                    <span className="font-medium text-slate-600">Pagado al instante (Efectivo/Banco)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="payment_status"
                      checked={purStatus === "Pendiente"}
                      onChange={() => setPurStatus("Pendiente")}
                      className="text-emerald-500 cursor-pointer"
                    />
                    <span className="font-medium text-slate-600">Cuenta por Pagar (Vencimiento)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition font-medium"
                >
                  Ingresar Factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ROLES DE NOMINA TALLER MODAL */}
      {showPayrollModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden animate-fade-in" id="payroll-modal-window">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold">Emisión del Rol de Pagos (Operarios Taller)</h3>
              </div>
              <button
                onClick={() => setShowPayrollModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePayroll} className="p-6 space-y-4 text-xs text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">Mes a Declarar</label>
                  <input
                    type="text"
                    value={payMonth}
                    onChange={(e) => setPayMonth(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">Sueldo Básico Fijado ($) *</label>
                  <input
                    type="number"
                    value={payBaseSalary}
                    onChange={(e) => setPayBaseSalary(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono font-bold"
                    min={0}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">Personal de Operación del Taller *</label>
                <select
                  value={payOperatorId}
                  onChange={(e) => setPayOperatorId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-emerald-500 bg-white"
                  required
                >
                  <option value="">-- Selecciona el operario para cruzar productividad --</option>
                  {operators.map((op) => (
                    <option key={op.uid} value={op.uid}>
                      {op.name} ({op.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Connected piecework lookup */}
              {payOperatorId && (
                <div className="space-y-4">
                  
                  {/* Realtime Attendance Control Integration */}
                  {(() => {
                    const opLogs = attendanceLogs.filter(log => log.operatorId === payOperatorId);
                    const totalClockInHours = opLogs.reduce((sum, log) => sum + (log.hoursWorked || 0), 0);
                    const totalClockInDays = opLogs.filter(log => log.status === "Puntual" || log.status === "Atraso" || log.justified).length;
                    const delaysCount = opLogs.filter(log => log.status === "Atraso").length;

                    return (
                      <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl space-y-2">
                        <div className="flex items-center justify-between border-b border-emerald-100/60 pb-2">
                          <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-emerald-600" />
                            Registro de Asistencias Integrado
                          </h4>
                          <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                            Sincronizado
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-slate-650 font-medium">
                          <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Días Asistidos</p>
                            <p className="font-bold text-slate-850 font-mono text-sm mt-0.5">{totalClockInDays} días</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Horas de Turno</p>
                            <p className="font-bold text-emerald-700 font-mono text-sm mt-0.5">{totalClockInHours.toFixed(1)} hrs</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-sans">Atrasados</p>
                            <p className={`font-bold font-mono text-sm mt-0.5 ${delaysCount > 0 ? "text-amber-600" : "text-slate-400"}`}>
                              {delaysCount} atrasos
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-slate-700 flex items-center gap-1">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        Productividad Destajo (Ruta de Trabajo)
                      </h4>
                      <span className="text-[10px] uppercase font-bold text-emerald-600 font-mono bg-emerald-50 px-2.5 py-0.5 rounded-full">
                        Automático
                      </span>
                    </div>

                  <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                    <div>
                      <p>Hojas de Ruta cerradas "Listo":</p>
                      <p className="font-bold text-slate-800 font-mono mt-1 text-sm">{completedOrdersCount} órdenes</p>
                    </div>
                    <div>
                      <p>Total de prendas confeccionadas:</p>
                      <p className="font-bold text-slate-800 font-mono mt-1 text-sm text-emerald-600">
                        {completedGarmentsQty} unidades
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-500 block">Tarifa por Prenda ($)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={payPieceworkRate}
                        onChange={(e) => setPayPieceworkRate(Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-emerald-500 font-mono font-bold"
                        placeholder="Ej: 1.50"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Monto Productividad Ganado:</p>
                      <p className="text-base font-black text-slate-800 mt-2 font-mono">
                        ${(completedGarmentsQty * payPieceworkRate).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Breakdown metrics displaying personal & patronal deduction */}
              {payOperatorId && (
                <div className="p-4 bg-slate-900 border border-slate-800 text-white rounded-xl space-y-3 text-xs">
                  <h4 className="font-bold text-center border-b border-slate-800 pb-2 text-slate-350">PROYECCIÓN ROL & APORTACIONES IESS</h4>
                  
                  <div className="space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Ingresos Brutos:</span>
                      <span>${(payBaseSalary + (completedGarmentsQty * payPieceworkRate)).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>Deducción Personal IESS (9.45%):</span>
                      <span>-${((payBaseSalary + (completedGarmentsQty * payPieceworkRate)) * 0.0945).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-indigo-300">
                      <span>Aporte Patronal Empresa (12.15%):</span>
                      <span>+${((payBaseSalary + (completedGarmentsQty * payPieceworkRate)) * 0.1215).toFixed(2)}</span>
                    </div>
                    <div className="border-t border-slate-800 mt-2 pt-2 flex justify-between font-bold text-sm text-emerald-400">
                      <span>LÍQUIDO A PAGAR OPERARIO:</span>
                      <span>${((payBaseSalary + (completedGarmentsQty * payPieceworkRate)) * 0.9055).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="font-semibold text-slate-600 block">Forma / Estado de Ejecución</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="payroll_pay_status"
                      checked={payStatus === "Pagado"}
                      onChange={() => setPayStatus("Pagado")}
                      className="text-emerald-500 cursor-pointer"
                    />
                    <span className="font-medium text-slate-600">Pagar y transferir inmediatamente (Egreso Caja)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="payroll_pay_status"
                      checked={payStatus === "Pendiente"}
                      onChange={() => setPayStatus("Pendiente")}
                      className="text-emerald-500 cursor-pointer"
                    />
                    <span className="font-medium text-slate-600">Registrar como Cuenta por Pagar (Nómina acumulada)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPayrollModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition font-medium"
                >
                  Emitir Rol de Pagos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. DETAIL VIEW PANEL FOR JOURNAL ENTRYS */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-fade-in" id="journal-entry-detail-window">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Partida Double-Entry
                </span>
                <h3 className="font-bold text-sm mt-1">Sisa Creaciones - ERP Ledger Entry</h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-left">
              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3 text-slate-600">
                <div>
                  <p className="font-semibold text-slate-400">Concepto de Asiento:</p>
                  <p className="font-bold text-slate-800 text-base mt-0.5">{selectedEntry.concept}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-400">Identificador Asiento / Referencia:</p>
                  <p className="font-mono mt-0.5 text-slate-700 font-bold">{selectedEntry.id} ({selectedEntry.reference})</p>
                </div>
              </div>

              {/* Lines debit vs credit */}
              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-slate-100 font-semibold font-sans">
                      <th className="py-2.5 px-4 text-left">Código Cuenta</th>
                      <th className="py-2.5 px-4 text-left">Nombre de la Cuenta</th>
                      <th className="py-2.5 px-4 text-right">Debe (Débito)</th>
                      <th className="py-2.5 px-4 text-right">Haber (Crédito)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {selectedEntry.lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-500">{line.accountId}</td>
                        <td className="py-3 px-4 pl-4 text-left font-bold text-slate-800">{line.accountName}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                          {line.debit > 0 ? `$${line.debit.toFixed(2)}` : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                          {line.credit > 0 ? `$${line.credit.toFixed(2)}` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t border-slate-200">
                      <td colSpan={2} className="py-3 px-4 text-slate-700 uppercase tracking-wider text-right">Sumas Cuadradas Balanceadas:</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 text-sm">
                        ${selectedEntry.lines.reduce((s, l) => s + l.debit, 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-800 text-sm">
                        ${selectedEntry.lines.reduce((s, l) => s + l.credit, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition font-semibold"
                >
                  Cerrar Vista Balanceada
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD DYNAMIC SUBACCOUNT MODAL --- */}
      {showAddAccountModal && selectedParentAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-600" />
                <span>Crear Subcuenta Contable</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✖
              </button>
            </div>
            <form onSubmit={handleSaveSubaccount} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-slate-500 mb-1">Cuenta de Origen (Padre)</label>
                <div className="bg-slate-50 p-2.5 rounded border text-slate-700">
                  <span className="font-mono text-emerald-700 font-bold mr-2">{selectedParentAccount.code}</span>
                  <span>{selectedParentAccount.name}</span>
                </div>
              </div>
              
              <div>
                <label className="block text-slate-500 mb-1">Código de Subcuenta Sugerido (Ecuadorian Sequential)</label>
                <input
                  type="text"
                  required
                  value={newAccountCode || ""}
                  onChange={(e) => setNewAccountCode(e.target.value)}
                  className="w-full p-2.5 border rounded"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Nombre de la Cuenta / Descripción</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Banco Pichincha, Caja Chica Taller..."
                  value={newAccountName || ""}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="w-full p-2.5 border rounded"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700"
                >
                  Crear Subcuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- REGISTRAR ASIENTO MANUAL MODAL --- */}
      {showJournalModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-4xl bg-white rounded-2xl p-6 shadow-xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                <Clipboard className="w-5 h-5 text-emerald-600" />
                <span>Registrar Asiento Manual (Libro Diario)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowJournalModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✖
              </button>
            </div>

            <form onSubmit={handleSaveManualJournalEntry} className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Concepto General de la Transacción</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Ajuste de fin de mes..."
                    value={manualConcept}
                    onChange={(e) => setManualConcept(e.target.value)}
                    className="w-full p-2.5 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Fecha Contable</label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full p-2.5 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Referencia Documento (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. Manual-001, Ajuste..."
                    value={manualReference}
                    onChange={(e) => setManualReference(e.target.value)}
                    className="w-full p-2.5 border rounded-xl"
                  />
                </div>
              </div>

              {/* Dynamic Lines Table */}
              <div className="space-y-1.5">
                <div className="font-semibold text-slate-700">Partidas del Asiento</div>
                <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <th className="p-3 w-1/2">Cuenta Contable</th>
                        <th className="p-3 w-1/4 text-right">Debe (Débito)</th>
                        <th className="p-3 w-1/4 text-right">Haber (Crédito)</th>
                        <th className="p-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {manualLines.map((line, index) => (
                        <tr key={index} className="hover:bg-slate-50/50">
                          <td className="p-2">
                            <select
                              required
                              value={line.accountCode}
                              onChange={(e) => handleUpdateManualLine(index, "accountCode", e.target.value)}
                              className="w-full p-2 border rounded-lg bg-white font-medium"
                            >
                              <option value="">-- Seleccionar Cuenta --</option>
                              {accounts
                                .filter(a => !a.isGroup) // Only leaf accounts can record transactions!
                                .map((acct) => (
                                  <option key={acct.code} value={acct.code}>
                                    {acct.code} - {acct.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-slate-400">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.debit || ""}
                                onChange={(e) => handleUpdateManualLine(index, "debit", e.target.value)}
                                disabled={line.credit > 0}
                                placeholder="0.00"
                                className="w-full p-2 pl-6 border rounded-lg text-right font-mono font-bold disabled:bg-slate-50 disabled:text-slate-400"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-slate-400">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.credit || ""}
                                onChange={(e) => handleUpdateManualLine(index, "credit", e.target.value)}
                                disabled={line.debit > 0}
                                placeholder="0.00"
                                className="w-full p-2 pl-6 border rounded-lg text-right font-mono font-bold disabled:bg-slate-50 disabled:text-slate-400"
                              />
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              disabled={manualLines.length <= 2}
                              onClick={() => handleRemoveManualLine(index)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent"
                              title="Eliminar Línea"
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border flex-wrap gap-2">
                {/* Add Line button */}
                <button
                  type="button"
                  onClick={handleAddManualLine}
                  className="p-2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Línea</span>
                </button>

                {/* Live Totals & Balance indicator */}
                <div className="text-right space-y-1">
                  <div className="flex gap-4 font-bold text-slate-700 flex-wrap justify-end">
                    <div>Debe Total: <span className="text-emerald-600 font-mono font-bold">${manualLines.reduce((s, l) => s + (l.debit || 0), 0).toFixed(2)}</span></div>
                    <div>Haber Total: <span className="text-slate-800 font-mono font-bold">${manualLines.reduce((s, l) => s + (l.credit || 0), 0).toFixed(2)}</span></div>
                  </div>
                  
                  {/* Balance status alert */}
                  {Math.abs(manualLines.reduce((s, l) => s + (l.debit || 0), 0) - manualLines.reduce((s, l) => s + (l.credit || 0), 0)) < 0.01 ? (
                    <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 justify-end">
                      <span>✔ Sumas Iguales (Asiento Balanceado)</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-rose-600 font-bold flex items-center gap-1 justify-end">
                      <span>⚠ Descuadre de: ${Math.abs(manualLines.reduce((s, l) => s + (l.debit || 0), 0) - manualLines.reduce((s, l) => s + (l.credit || 0), 0)).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowJournalModal(false)}
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Math.abs(manualLines.reduce((s, l) => s + (l.debit || 0), 0) - manualLines.reduce((s, l) => s + (l.credit || 0), 0)) >= 0.01 || manualLines.reduce((s, l) => s + (l.debit || 0), 0) <= 0}
                  className="px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 transition shadow-sm font-sans text-xs uppercase tracking-wider"
                >
                  Guardar Asiento Contable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
