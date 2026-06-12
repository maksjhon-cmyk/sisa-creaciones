import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, setDoc, doc, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { FinishedProduct, UserProfile, Client, Invoice, InvoiceItem } from "../types";
import { autoRegisterJournalEntry } from "../utils/accounting";
import {
  Search, Plus, Minus, Trash2, Receipt, FileText, Send, CheckCircle, Clock,
  AlertTriangle, ShoppingCart, UserPlus, Printer, X, Check, Shield, FileCheck, RefreshCw,
  Download, FileSpreadsheet
} from "lucide-react";

interface SalesInvoicingProps {
  user: UserProfile;
  setActiveTab?: (tab: string) => void;
}

export default function SalesInvoicing({ user, setActiveTab }: SalesInvoicingProps) {
  // Real-time collections lists
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Sale formulation state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [cartItems, setCartItems] = useState<InvoiceItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [ambienteMode, setAmbienteMode] = useState<"Pruebas" | "Producción">("Pruebas");
  const [saleType, setSaleType] = useState<"factura" | "recibo">("factura");
  const [applyIvaInReceipt, setApplyIvaInReceipt] = useState<boolean>(false);

  // Client search and registration states
  const [clientSearchString, setClientSearchString] = useState("");
  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientIdType, setNewClientIdType] = useState<"cédula" | "ruc" | "consumidor_final">("cédula");
  const [newClientIdNumber, setNewClientIdNumber] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Factura emission wizard simulation state
  const [isFinishingSale, setIsFinishingSale] = useState(false);
  const [emissionStep, setEmissionStep] = useState<"xml" | "signature" | "sri_send" | "authorized" | "done">("xml");
  const [activeAccessKey, setActiveAccessKey] = useState<string>("");
  const [emittedInvoiceObject, setEmittedInvoiceObject] = useState<Invoice | null>(null);

  // Invoices historical list viewing
  const [selectedHistoricalInvoice, setSelectedHistoricalInvoice] = useState<Invoice | null>(null);

  // Real-time synchronization
  useEffect(() => {
    setLoading(true);

    const qProducts = query(collection(db, "finished_products"));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const items: FinishedProduct[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as FinishedProduct);
      });
      setProducts(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "finished_products");
    });

    const qClients = query(collection(db, "clients"));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      const items: Client[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as Client);
      });
      setClients(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "clients");
    });

    const qInvoices = query(collection(db, "invoices"));
    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      const items: Invoice[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as Invoice);
      });
      // Sort recently created first
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInvoices(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "invoices");
    });

    return () => {
      unsubProducts();
      unsubClients();
      unsubInvoices();
    };
  }, []);

  // Helper validation for Cédula and RUC in Ecuador
  const validateEcuadorianID = (type: "cédula" | "ruc" | "consumidor_final", idNum: string): boolean => {
    const cleanNum = idNum.trim();
    if (type === "consumidor_final") {
      return cleanNum === "9999999999999";
    }
    if (type === "cédula") {
      if (cleanNum.length !== 10) return false;
      if (!/^\d+$/.test(cleanNum)) return false;
      
      // Simple mod10 verification logic for Ecuadorian Identity Card
      const province = parseInt(cleanNum.substring(0, 2), 10);
      if (province < 1 || province > 24) return false;
      
      const thirdDigit = parseInt(cleanNum.charAt(2), 10);
      if (thirdDigit >= 6) return false; // Must be < 6 for natural person CI
      
      let sum = 0;
      const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
      for (let i = 0; i < 9; i++) {
        let val = parseInt(cleanNum.charAt(i), 10) * coefficients[i];
        if (val > 9) val -= 9;
        sum += val;
      }
      
      const verifier = parseInt(cleanNum.charAt(9), 10);
      const mod = sum % 10;
      const expected = mod === 0 ? 0 : 10 - mod;
      return expected === verifier;
    }
    if (type === "ruc") {
      if (cleanNum.length !== 13) return false;
      if (!/^\d+$/.test(cleanNum)) return false;
      if (!cleanNum.endsWith("001")) return false;
      
      // Verify natural / juridical person mod 10 or 11
      const CI_part = cleanNum.substring(0, 10);
      return validateEcuadorianID("cédula", CI_part) || cleanNum.startsWith("179") || cleanNum.startsWith("099");
    }
    return false;
  };

  // Preset Consumidor Final client helper
  const addDefaultConsumidorFinal = async () => {
    const cfId = "cf-9999999999999";
    const cfClient: Client = {
      id: cfId,
      name: "CONSUMIDOR FINAL",
      idType: "consumidor_final",
      idNumber: "9999999999999",
      email: "consumidorfinal@sisacreaciones.com",
      phone: "0999999999",
      address: "Sin Dirección (Consumidor Final)",
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, "clients", cfId), cfClient);
      setSelectedClient(cfClient);
    } catch (err) {
      console.error(err);
    }
  };

  // Submit client registration
  const handleRegisterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanIdNum = newClientIdNumber.trim();
    const cleanName = newClientName.trim().toUpperCase();

    if (!cleanName) {
      setValidationError("El nombre del cliente no puede estar vacío.");
      return;
    }

    if (newClientIdType !== "consumidor_final" && !validateEcuadorianID(newClientIdType, cleanIdNum)) {
      setValidationError(
        `El número de ${newClientIdType === "cédula" ? "Cédula (10 d)" : "RUC (13 d)"} ingresado es inválido para el SRI de Ecuador.`
      );
      return;
    }

    const clientId = `${newClientIdType}_${cleanIdNum}`;
    const newClient: Client = {
      id: clientId,
      name: cleanName,
      idType: newClientIdType,
      idNumber: cleanIdNum,
      email: newClientEmail.trim() || "ventas@sisacreaciones.com",
      phone: newClientPhone.trim() || "0999999999",
      address: newClientAddress.trim() || "Quito, Ecuador",
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "clients", clientId), newClient);
      setSelectedClient(newClient);
      setShowAddClientForm(false);
      setNewClientName("");
      setNewClientIdNumber("");
      setNewClientEmail("");
      setNewClientPhone("");
      setNewClientAddress("");
    } catch (err) {
      console.error(err);
      setValidationError("Error al guardar cliente en Firestore.");
    }
  };

  // Filter local clients based on input
  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(clientSearchString.toLowerCase()) ||
      c.idNumber.includes(clientSearchString)
  );

  // Cart operations
  const addToCart = (product: FinishedProduct) => {
    // Check if garment is already in cart
    const existingIndex = cartItems.findIndex((i) => i.productId === product.id);

    if (existingIndex > -1) {
      const updated = [...cartItems];
      const nextQty = updated[existingIndex].quantity + 1;
      
      // Stock boundary check (we emit warnings rather than blocking completely for custom orders)
      updated[existingIndex].quantity = nextQty;
      updated[existingIndex].total = nextQty * updated[existingIndex].price - updated[existingIndex].discount;
      setCartItems(updated);
    } else {
      const newItem: InvoiceItem = {
        productId: product.id,
        name: product.name,
        size: product.size,
        color: product.color,
        quantity: 1,
        price: product.salePrice,
        discount: 0,
        total: product.salePrice,
      };
      setCartItems([...cartItems, newItem]);
    }
  };

  const updateCartQty = (productId: string, increment: boolean) => {
    const updated = cartItems.map((item) => {
      if (item.productId === productId) {
        const nextQty = increment ? item.quantity + 1 : Math.max(1, item.quantity - 1);
        return {
          ...item,
          quantity: nextQty,
          total: nextQty * item.price - item.discount,
        };
      }
      return item;
    });
    setCartItems(updated);
  };

  const updateCartDiscount = (productId: string, discountVal: number) => {
    const updated = cartItems.map((item) => {
      if (item.productId === productId) {
        const maxDiscount = item.price * item.quantity;
        const validDiscount = Math.max(0, Math.min(maxDiscount, discountVal));
        return {
          ...item,
          discount: validDiscount,
          total: item.price * item.quantity - validDiscount,
        };
      }
      return item;
    });
    setCartItems(updated);
  };

  const removeFromCart = (productId: string) => {
    setCartItems(cartItems.filter((i) => i.productId !== productId));
  };

  // Computations
  const baseSubtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const sumItemDiscounts = cartItems.reduce((acc, item) => acc + (item.discount || 0), 0);

  const isIvaApplied = saleType === "factura" || (saleType === "recibo" && applyIvaInReceipt);

  const subtotal0 = isIvaApplied ? 0 : Math.max(0, baseSubtotal - sumItemDiscounts);
  const subtotalIVA = isIvaApplied ? Math.max(0, baseSubtotal - sumItemDiscounts) : 0;
  const ivaRate = isIvaApplied ? 15 : 0;
  const ivaAmount = isIvaApplied ? Math.round((subtotalIVA * (15 / 100)) * 100) / 100 : 0;
  const grandTotal = Math.round((subtotal0 + subtotalIVA + ivaAmount) * 100) / 100;

  // Next Invoice Sequential calculation
  const getNextSequential = () => {
    const count = invoices.length + 1;
    return String(count).padStart(9, "0");
  };

  const generateEcuadorianAccessKey = (sequential: string, date: Date, env: "Pruebas" | "Producción") => {
    // SRI format: 49 digits string
    // 1-8: Fecha ddmmyyyy
    // 9-10: Tipo de comprobante (01 for Factura)
    // 11-23: RUC Sisa Creaciones (1792345678001)
    // 24: Ambiente (1: Pruebas, 2: Producción)
    // 25-30: Serie (001001)
    // 31-39: Secuencial/Consecutivo (9 digits)
    // 40-47: Codigo numerico arbitrario (8 digits)
    // 48: Tipo de emisión (1: normal)
    // 49: Digito verificador modulo 11
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());
    const dateStr = `${day}${month}${year}`;

    const typeDoc = "01";
    const rucSisa = "1792345678001";
    const envDigit = env === "Pruebas" ? "1" : "2";
    const series = "001001";
    const randomCode = "88887777";
    const typeEmission = "1";

    const baseKey = `${dateStr}${typeDoc}${rucSisa}${envDigit}${series}${sequential}${randomCode}${typeEmission}`;
    
    // Simple modulo 11 check digit calculation
    let factor = 2;
    let sum = 0;
    for (let i = baseKey.length - 1; i >= 0; i--) {
      sum += parseInt(baseKey.charAt(i), 10) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const verifier = 11 - (sum % 11);
    const finalVerifier = verifier === 11 ? "0" : verifier === 10 ? "1" : String(verifier);

    return `${baseKey}${finalVerifier}`;
  };

  const handlePrintReceipt = (invoice: Invoice) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Por favor, permite ventanas emergentes para imprimir recibos.");
      return;
    }

    const itemsRows = invoice.items.map(item => `
      <tr style="border-bottom: 1px dashed #dddddd;">
        <td style="padding: 4px 0; text-align: left;">
          <div style="font-weight: bold;">${item.name}</div>
          <div style="font-size: 10px; color: #555555;">Talla: ${item.size || "-"} | Color: ${item.color || "-"}</div>
          <div style="font-size: 10px; color: #555555;">${item.quantity} x $${item.price.toFixed(2)}</div>
        </td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top;">$${item.total.toFixed(2)}</td>
      </tr>
    `).join("");

    const isRecibo = invoice.status === "RECIBO_INTERNO";

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket Sisa - ${invoice.invoiceNumber}</title>
        <meta charset="utf-8">
        <style>
          @page { margin: 0; }
          body { 
            font-family: 'Courier New', Courier, monospace; 
            margin: 0; 
            padding: 10px; 
            width: 76mm; /* 80mm generic size */
            color: #000000; 
            background-color: #ffffff;
            font-size: 11px;
            line-height: 1.3;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000000; margin: 8px 0; }
          .double-divider { border-top: 2px double #000000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          .totals td { padding: 3px 0; }
          .header-title { font-size: 16px; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; }
          .footer { font-size: 10px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="header-title">SISA CREACIONES</div>
          <div style="font-size: 10px;">Moda y Confección de Alta Costura</div>
          <div style="font-size: 10px;">R.U.C. 1792345678001</div>
          <div style="font-size: 10px;">Sangolquí, Ecuador</div>
          <div style="font-size: 10px;">Tel: (02) 234-5678</div>
          <div class="divider"></div>
          <div class="bold" style="font-size: 12px;">${isRecibo ? "RECIBO DE CONTROL INTERNO" : "COMPROBANTE ELECTRÓNICO"}</div>
          <div style="font-size: 10px;">Nº: ${invoice.invoiceNumber}</div>
          <div style="font-size: 10px;">Fecha: ${new Date(invoice.createdAt).toLocaleString("es-EC")}</div>
        </div>

        <div class="divider"></div>

        <div>
          <div class="bold">CLIENTE:</div>
          <div>${invoice.clientName}</div>
          <div>ID: ${invoice.clientIdNumber}</div>
          <div>Email: ${invoice.clientEmail}</div>
        </div>

        <div class="double-divider"></div>

        <div class="bold center">ARTÍCULOS</div>
        <table>
          ${itemsRows}
        </table>

        <div class="double-divider"></div>

        <table class="totals">
          <tr>
            <td>Subtotal 0%:</td>
            <td style="text-align: right;">$${invoice.subtotal0.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Subtotal 15%:</td>
            <td style="text-align: right;">$${invoice.subtotalIVA.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Descuento:</td>
            <td style="text-align: right;">-$${(invoice.discount || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td>IVA (${invoice.ivaRate}%):</td>
            <td style="text-align: right;">$${invoice.ivaAmount.toFixed(2)}</td>
          </tr>
          <tr class="bold" style="font-size: 12px;">
            <td>TOTAL PAGADO:</td>
            <td style="text-align: right;">$${invoice.total.toFixed(2)}</td>
          </tr>
        </table>

        <div class="divider"></div>

        <div class="center footer">
          ${isRecibo 
            ? "CONTROL DE CAJA INTERNO<br>Sisa Creaciones S.A.<br>¡Gracias por su confianza!"
            : "Autorizado por SRI de Ecuador<br>Clave de Acceso:<br>" + invoice.claveAcceso}
          <div style="margin-top: 10px;">Siga tejiendo sus sueños.</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleExportPDF = (invoice: Invoice) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Por favor, permite ventanas emergentes para exportar el PDF.");
      return;
    }
    
    const itemsRows = invoice.items.map(item => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 0; text-align: left;">
          <div style="font-weight: 600; color: #1e293b; font-size: 12px;">${item.name}</div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Talla: ${item.size || "-"} | Color: ${item.color || "-"}</div>
        </td>
        <td style="padding: 10px 0; text-align: center; color: #475569; font-size: 12px;">${item.quantity}</td>
        <td style="padding: 10px 0; text-align: right; color: #475569; font-size: 12px;">$${item.price.toFixed(2)}</td>
        <td style="padding: 10px 0; text-align: right; color: #e11d48; font-size: 12px;">-$${(item.discount || 0).toFixed(2)}</td>
        <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #1e293b; font-size: 12px;">$${item.total.toFixed(2)}</td>
      </tr>
    `).join("");

    const isRecibo = invoice.status === "RECIBO_INTERNO";

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprobante Sisa Creaciones - ${invoice.invoiceNumber}</title>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 40px; color: #334155; background-color: #ffffff; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; }
          .logo-area { font-family: 'Segoe UI', sans-serif; }
          .logo { font-size: 24px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 1px; }
          .tagline { font-size: 10px; color: #64748b; font-weight: bold; margin-top: 4px; }
          .invoice-rec { text-align: right; }
          .invoice-rec h1 { font-size: 20px; font-weight: 950; color: #1e293b; margin: 0 0 5px 0; text-transform: uppercase; }
          .invoice-rec p { font-size: 12px; margin: 3px 0; font-family: monospace; color: #4f46e5; font-weight: bold; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin: 30px 0; }
          .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 10px; }
          .info-block p { font-size: 12px; margin: 5px 0; line-height: 1.5; }
          .info-block span { font-weight: bold; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin: 30px 0; }
          th { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
          .totals-wrapper { display: flex; justify-content: flex-end; }
          .totals-table { width: 300px; border-collapse: collapse; }
          .totals-table td { padding: 8px 0; font-size: 12px; }
          .totals-table tr.grand { border-top: 2px solid #4f46e5; font-size: 15px; font-weight: bold; color: #4f46e5; }
          .footer { text-align: center; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 10px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-area">
              <div class="logo">Sisa Creaciones</div>
              <div class="tagline">MODA, ALTA COSTURA Y ERP INTEGRADO</div>
            </div>
            <div class="invoice-rec">
              <h1>${isRecibo ? "RECIBO INTERNO DE VENTA" : "FACTURA ELECTRÓNICA"}</h1>
              <p>Nº: ${invoice.invoiceNumber}</p>
              <div style="font-size: 10px; color: #64748b; margin-top: 5px;">Fecha: ${new Date(invoice.createdAt).toLocaleString("es-EC")}</div>
            </div>
          </div>
          
          <div class="info-grid">
            <div class="info-block">
              <div class="section-title">EMISOR</div>
              <p><span>Sisa Creaciones S.A.</span></p>
              <p>R.U.C.: 1792345678001</p>
              <p>Dirección: Av. General Enríquez, Sangolquí, Ecuador</p>
              <p>Teléfono: (02) 234-5678</p>
            </div>
            <div class="info-block">
              <div class="section-title">CLIENTE / DESTINATARIO</div>
              <p><span>Nombre:</span> ${invoice.clientName}</p>
              <p><span>Identificación:</span> ${invoice.clientIdNumber}</p>
              <p><span>Email:</span> ${invoice.clientEmail}</p>
              <p><span>Dirección:</span> Quito, Ecuador</p>
            </div>
          </div>

          <table style="width: 100%;">
            <thead>
              <tr>
                <th style="text-align: left;">DESCRIPCIÓN DE LA PRENDA</th>
                <th style="text-align: center; width: 60px;">CANT</th>
                <th style="text-align: right; width: 100px;">P. UNIT</th>
                <th style="text-align: right; width: 100px;">DESC</th>
                <th style="text-align: right; width: 100px;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="totals-wrapper">
            <table class="totals-table">
              <tr>
                <td style="color: #64748b;">Subtotal 0% (Sin IVA):</td>
                <td style="text-align: right; font-weight: 500;">$${invoice.subtotal0.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="color: #64748b;">Subtotal 15% (Con IVA):</td>
                <td style="text-align: right; font-weight: 500;">$${invoice.subtotalIVA.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="color: #64748b;">Descuento Total:</td>
                <td style="text-align: right; color: #e11d48; font-weight: 500;">-$${(invoice.discount || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="color: #64748b;">IVA (${invoice.ivaRate}%):</td>
                <td style="text-align: right; font-weight: 500;">$${invoice.ivaAmount.toFixed(2)}</td>
              </tr>
              <tr class="grand">
                <td>TOTAL:</td>
                <td style="text-align: right;">$${invoice.total.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <div class="footer">
            <p>${isRecibo ? "Documento emitido exclusivamente para control de inventario y caja interna. No tiene validez fiscal del SRI." : "Este documento tiene validez tributaria ante el SRI. Autorizado electrónicamente."}</p>
            <p>© 2026 Sisa Creaciones ERP - Soluciones de Alta Costura</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleExportExcel = (invoice: Invoice) => {
    const filename = `Recibo_${invoice.invoiceNumber}.xls`;
    const excelContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          .header { font-size: 16px; font-weight: bold; color: #4f46e5; text-align: center; }
          .title { font-size: 12px; font-weight: bold; background-color: #f3f4f6; }
          th { background-color: #4f46e5; color: white; font-weight: bold; }
          td, th { border: 0.5pt solid #e5e7eb; padding: 5px; text-align: left; }
          .number { text-align: right; }
          .total-label { font-weight: bold; text-align: right; }
          .total-val { font-weight: bold; text-align: right; color: #4f46e5; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="7" class="header">SISA CREACIONES - CONTROL DE CAJA</td></tr>
          <tr><td colspan="7" style="text-align: center; font-size: 11px; color: #4b5563;">DOCUMENTO DE CONTROL INTERNO</td></tr>
          <tr><td colspan="7"></td></tr>
          <tr>
            <td class="title">Recibo Nº:</td>
            <td colspan="6">${invoice.invoiceNumber}</td>
          </tr>
          <tr>
            <td class="title">Fecha:</td>
            <td colspan="6">${new Date(invoice.createdAt).toLocaleString("es-EC")}</td>
          </tr>
          <tr>
            <td class="title">Cliente:</td>
            <td colspan="6">${invoice.clientName}</td>
          </tr>
          <tr>
            <td class="title">Identificación:</td>
            <td colspan="6">${invoice.clientIdNumber}</td>
          </tr>
          <tr>
            <td class="title">Email:</td>
            <td colspan="6">${invoice.clientEmail}</td>
          </tr>
          <tr><td colspan="7"></td></tr>
          <thead>
            <tr>
              <th>Detalle prenda</th>
              <th>Talla</th>
              <th>Color</th>
              <th>Cantidad</th>
              <th>Precio Unit.</th>
              <th>Desc.</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.size || "-"}</td>
                <td>${item.color || "-"}</td>
                <td class="number">${item.quantity}</td>
                <td class="number">$${item.price.toFixed(2)}</td>
                <td class="number">$${(item.discount || 0).toFixed(2)}</td>
                <td class="number">$${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr><td colspan="7"></td></tr>
            <tr>
              <td colspan="6" class="total-label">Subtotal 0% (Sin IVA):</td>
              <td class="number">$${invoice.subtotal0.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="6" class="total-label">Subtotal 15% (Con IVA):</td>
              <td class="number">$${invoice.subtotalIVA.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="6" class="total-label">Descuento Total:</td>
              <td class="number">-$${invoice.discount?.toFixed(2) || "0.00"}</td>
            </tr>
            <tr>
              <td colspan="6" class="total-label">IVA (${invoice.ivaRate}%):</td>
              <td class="number">$${invoice.ivaAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="6" class="total-label" style="font-size: 13px;">TOTAL REGISTRADO:</td>
              <td class="total-val" style="font-size: 13px;">$${invoice.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Electronic invoices emission step control
  const triggerSRIInvoicingFlow = async () => {
    if (cartItems.length === 0) return;

    let clientToUse = selectedClient;
    if (!clientToUse && saleType === "recibo") {
      // Use/Create Consumidor Final default
      const cfId = "cf-9999999999999";
      clientToUse = {
        id: cfId,
        name: "CONSUMIDOR FINAL",
        idType: "consumidor_final",
        idNumber: "9999999999999",
        email: "consumidorfinal@sisacreaciones.com",
        phone: "0999999999",
        address: "Sin Dirección (Consumidor Final)",
        updatedAt: new Date().toISOString(),
      };
      
      try {
        await setDoc(doc(db, "clients", cfId), clientToUse);
        setSelectedClient(clientToUse);
      } catch (err) {
        console.error("Error creating Consumidor Final default client:", err);
      }
    }

    if (!clientToUse) return;

    const sequential = getNextSequential();
    const date = new Date();

    if (saleType === "factura") {
      setIsFinishingSale(true);
      setEmissionStep("xml");
      const invoiceNumber = `001-001-${sequential}`;
      const accessKey = generateEcuadorianAccessKey(sequential, date, ambienteMode);
      setActiveAccessKey(accessKey);

      // Simulated wizard timeline
      setTimeout(() => {
        setEmissionStep("signature");
        setTimeout(() => {
          setEmissionStep("sri_send");
          setTimeout(async () => {
            setEmissionStep("authorized");

            const invoiceId = `inv_${sequential}`;
            const newInvoice: Invoice = {
              id: invoiceId,
              invoiceNumber,
              claveAcceso: accessKey,
              clientId: clientToUse!.id || "cf-9999999999999",
              clientName: clientToUse!.name || "CONSUMIDOR FINAL",
              clientIdNumber: clientToUse!.idNumber || "9999999999999",
              clientEmail: clientToUse!.email || "consumidorfinal@sisacreaciones.com",
              subtotal0: subtotal0 || 0,
              subtotalIVA: subtotalIVA || 0,
              discount: sumItemDiscounts || 0,
              ivaRate: ivaRate || 0,
              ivaAmount: ivaAmount || 0,
              total: grandTotal || 0,
              status: "AUTORIZADO",
              ambiente: ambienteMode,
              items: cartItems.map(item => ({
                productId: item.productId,
                name: item.name,
                size: item.size || "-",
                color: item.color || "-",
                quantity: item.quantity,
                price: item.price,
                discount: item.discount || 0,
                total: item.total
              })),
              createdAt: date.toISOString(),
              updatedAt: date.toISOString(),
            };

            try {
              // Inject instantly in second plane
              setInvoices((prev) => [newInvoice, ...prev.filter((inv) => inv.id !== newInvoice.id)]);

              // Write invoice
              await setDoc(doc(db, "invoices", invoiceId), newInvoice);

              // Record automatic journal entry (bookkeeping)
              await autoRegisterJournalEntry(
                `Venta según Factura ${newInvoice.invoiceNumber} - Cliente: ${newInvoice.clientName}`,
                newInvoice.id,
                [
                  { accountId: "1.1", debit: newInvoice.total, credit: 0 },
                  { accountId: "4.1", debit: 0, credit: newInvoice.total }
                ],
                newInvoice.createdAt
              );

              // Deduct finished product stock safely in real-time
              for (const item of cartItems) {
                const matchedProduct = products.find((p) => p.id === item.productId);
                if (matchedProduct) {
                  const updatedStock = Math.max(0, matchedProduct.stock - item.quantity);
                  const docRef = doc(db, "finished_products", matchedProduct.id);
                  await setDoc(docRef, { stock: updatedStock, updatedAt: new Date().toISOString() }, { merge: true });
                }
              }

              setEmittedInvoiceObject(newInvoice);
              setEmissionStep("done");
            } catch (err) {
              console.error("Error creating electronic invoice:", err);
              setEmissionStep("xml"); // Reset back on exception
              setIsFinishingSale(false);
            }
          }, 1200);
        }, 1000);
      }, 1000);
    } else {
      // 'Nota de Venta / Recibo Interno' - Omit/skip full SRI steps entirely
      const invoiceNumber = `REC-001-001-${sequential}`;
      const accessKey = "RECIBO-INTERNO-SISA";
      const invoiceId = `rec_${sequential}`;

      const newInvoice: Invoice = {
        id: invoiceId,
        invoiceNumber,
        claveAcceso: accessKey,
        clientId: clientToUse.id || "cf-9999999999999",
        clientName: clientToUse.name || "CONSUMIDOR FINAL",
        clientIdNumber: clientToUse.idNumber || "9999999999999",
        clientEmail: clientToUse.email || "consumidorfinal@sisacreaciones.com",
        subtotal0: subtotal0 || 0,
        subtotalIVA: subtotalIVA || 0,
        discount: sumItemDiscounts || 0,
        ivaRate: ivaRate || 0,
        ivaAmount: ivaAmount || 0,
        total: grandTotal || 0,
        status: "RECIBO_INTERNO",
        ambiente: ambienteMode,
        items: cartItems.map(item => ({
          productId: item.productId,
          name: item.name,
          size: item.size || "-",
          color: item.color || "-",
          quantity: item.quantity,
          price: item.price,
          discount: item.discount || 0,
          total: item.total
        })),
        createdAt: date.toISOString(),
        updatedAt: date.toISOString(),
      };

      // 1) Inject instantly in second plane
      setInvoices((prev) => [newInvoice, ...prev.filter((inv) => inv.id !== newInvoice.id)]);

      // 2) Open modal and set directly to DONE step
      setEmittedInvoiceObject(newInvoice);
      setEmissionStep("done");
      setIsFinishingSale(true);

      // 3) Write to store / deduct stock synchronously to verify success
      (async () => {
        try {
          await setDoc(doc(db, "invoices", invoiceId), newInvoice);

          // Record automatic journal entry (bookkeeping)
          await autoRegisterJournalEntry(
            `Venta según Recibo Interno ${newInvoice.invoiceNumber} - Cliente: ${newInvoice.clientName}`,
            newInvoice.id,
            [
              { accountId: "1.1", debit: newInvoice.total, credit: 0 },
              { accountId: "4.2", debit: 0, credit: newInvoice.total }
            ],
            newInvoice.createdAt
          );

          // Deduct finished product stock safely in real-time
          for (const item of cartItems) {
            const matchedProduct = products.find((p) => p.id === item.productId);
            if (matchedProduct) {
              const updatedStock = Math.max(0, matchedProduct.stock - item.quantity);
              const docRef = doc(db, "finished_products", matchedProduct.id);
              await setDoc(docRef, { stock: updatedStock, updatedAt: new Date().toISOString() }, { merge: true });
            }
          }
        } catch (err) {
          console.error("Error registering internal sale receipt in DB:", err);
        }
      })();
    }
  };

  const resetBillingLayout = () => {
    setCartItems([]);
    setSelectedClient(null);
    setEmittedInvoiceObject(null);
    setIsFinishingSale(false);
  };

  return (
    <div className="space-y-6" id="sales-invoicing-module">
      {/* Title & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900 flex items-center gap-2">
            <Receipt className="w-8 h-8 text-emerald-600 shrink-0" />
            <span>Ventas y Facturación Electrónica</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Punto de venta y módulo emisor autorizado de comprobantes offline para el SRI de Ecuador.
          </p>
        </div>

        {/* Setting Switch & Quick Add default customer */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200">
            <button
              onClick={() => setAmbienteMode("Pruebas")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                ambienteMode === "Pruebas" ? "bg-amber-100 text-amber-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Ambiente PRUEBAS
            </button>
            <button
              onClick={() => setAmbienteMode("Producción")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                ambienteMode === "Producción" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Ambiente PROD
            </button>
          </div>

          <button
            onClick={addDefaultConsumidorFinal}
            className="px-3.5 py-1.5 flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 rounded-xl transition shadow-sm"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Cons. Final</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Customer Selection & Product Catalog POS */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* CLIENT PICKER & REGISTRY */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">1. Cliente Facturación</h2>
              {!showAddClientForm && (
                <button
                  onClick={() => setShowAddClientForm(true)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Cliente</span>
                </button>
              )}
            </div>

            {/* Display Show/Hide Add Client redirection message */}
            {showAddClientForm ? (
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 animate-fade-in">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span>Registro Unificado de Clientes</span>
                  </span>
                  <button type="button" onClick={() => setShowAddClientForm(false)} className="text-slate-400 hover:text-slate-650">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para evitar registros duplicados y dar cumplimiento a la facturación electrónica del SRI, 
                  <strong> Sisa Creaciones ERP</strong> centraliza todos los registros dentro del módulo maestro.
                </p>

                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-[11px] text-indigo-850 font-medium leading-relaxed">
                  ⚠️ El registro rápido directo está desactivado en facturación. Por favor, registre la ficha del cliente nuevo presionando el botón "Ir a Registrar" o use el catálogo lateral "Gestión de Clientes".
                </div>

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddClientForm(false)}
                    className="flex-1 py-2 text-xs font-bold text-slate-505 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition"
                  >
                    Regresar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddClientForm(false);
                      setActiveTab?.("clients");
                    }}
                    className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Ir a Registrar</span>
                  </button>
                </div>
              </div>
            ) : selectedClient ? (
              // Selected Client Preview Card
              <div className="p-3.5 bg-emerald-50/50 border border-emerald-100/80 rounded-xl flex items-center justify-between animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                    {selectedClient.name.substring(0, 2)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <span>{selectedClient.name}</span>
                      <span className="text-[9px] bg-emerald-600 text-white font-mono rounded px-1 text-center font-normal tracking-wider lowercase">
                        {selectedClient.idType}
                      </span>
                    </h4>
                    <p className="text-[11px] font-mono text-slate-500 mt-1">ID: {selectedClient.idNumber}</p>
                    <p className="text-[10px] text-slate-500">Email: {selectedClient.email} / Tel: {selectedClient.phone}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              // Search input
              <div className="relative">
                <Search className="absolute left-3.5 top-3 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Escribe el nombre o documento para buscar cliente..."
                  value={clientSearchString}
                  onChange={(e) => setClientSearchString(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
                />

                {/* Autocomplete dropdown */}
                {clientSearchString.trim().length > 0 && (
                  <div className="absolute z-10 w-full mt-1.5 bg-white border border-slate-100 rounded-xl shadow-lg max-h-52 overflow-y-auto pr-1">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedClient(c);
                            setClientSearchString("");
                          }}
                          className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-100 flex justify-between items-center transition"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-800">{c.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{c.idType.toUpperCase()}: {c.idNumber}</p>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-400">Seleccionar</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-400">
                        Ningún cliente coincide. Haz clic en "Nuevo Cliente" para registrarlo.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PRODUCT DIRECTORY POS CARDS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">2. Catálogo de Confecciones (Sisa)</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[480px] overflow-y-auto pr-1">
              {products.map((p) => {
                const isLowStock = p.stock <= 5;
                const isInCart = cartItems.some((i) => i.productId === p.id);
                return (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-slate-200/80 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="bg-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide font-sans">
                          {p.type}
                        </span>
                        <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 rounded">
                          Talla {p.size}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-slate-800 mt-2 leading-tight">{p.name}</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Color: {p.color}</p>
                      
                      <div className="mt-3 flex justify-between items-baseline">
                        <span className="text-indigo-600 font-bold text-sm">${p.salePrice.toFixed(2)}</span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isLowStock ? "bg-amber-100 text-amber-800" : "bg-slate-200/50 text-slate-600"
                          }`}
                        >
                          Stock: {p.stock}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => addToCart(p)}
                      disabled={p.stock <= 0}
                      className={`mt-4 w-full py-1.5 text-xs font-bold rounded-lg transition inline-flex items-center justify-center gap-1 ${
                        p.stock <= 0
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : isInCart
                          ? "bg-slate-800 text-white hover:bg-slate-900"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      <ShoppingCart className="w-3 h-3" />
                      <span>{p.stock <= 0 ? "Agotado" : isInCart ? "Añadir más" : "Añadir a Factura"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Active Cart, Totals and Emit Button */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-auto min-h-[580px]">
          <div>
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                <span>{saleType === "factura" ? "Detalle de Factura" : "Detalle de Venta (Interna)"}</span>
              </h2>
              <span className="text-xs text-indigo-600 font-bold font-mono">
                #{getNextSequential()}
              </span>
            </div>

            {/* Selector de Tipo de Venta Dual */}
            <div className="mt-4 p-1 bg-slate-100 rounded-xl flex border border-slate-250">
              <button
                type="button"
                onClick={() => setSaleType("factura")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  saleType === "factura" ? "bg-white text-slate-900 shadow-sm" : "text-slate-505 hover:text-slate-800"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Factura Electrónica SRI</span>
              </button>
              <button
                type="button"
                onClick={() => setSaleType("recibo")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  saleType === "recibo" ? "bg-indigo-650 text-white shadow-sm font-bold bg-indigo-600" : "text-slate-505 hover:text-slate-800"
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Nota de Venta / Recibo Interno</span>
              </button>
            </div>

            {/* Selector de Impuesto Opcional (Modo Recibo) */}
            {saleType === "recibo" && (
              <div className="mt-3 px-3.5 py-2.5 bg-indigo-50/40 rounded-xl border border-indigo-100/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Aplicar IVA en Recibo</span>
                    <span className="text-[10px] text-slate-500 block">Recalcular total tarifa 15%</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="apply-iva-receipt-toggle"
                    checked={applyIvaInReceipt}
                    onChange={(e) => setApplyIvaInReceipt(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            )}

            {/* Cart Items List */}
            <div className="space-y-3.5 my-4 max-h-[300px] overflow-y-auto pr-1">
              {cartItems.length > 0 ? (
                cartItems.map((item) => {
                  const matchedProduct = products.find((p) => p.id === item.productId);
                  const maxStock = matchedProduct ? matchedProduct.stock : 999;
                  const stockAlert = item.quantity > maxStock;

                  return (
                    <div key={item.productId} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 leading-tight">{item.name}</h4>
                          <span className="text-[10px] text-slate-400 font-medium">Size {item.size} / Color: {item.color}</span>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex justify-between items-center gap-2 text-xs">
                        {/* Selector de cantidad */}
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5">
                          <button
                            onClick={() => updateCartQty(item.productId, false)}
                            className="p-1 hover:bg-slate-50 text-slate-500 rounded"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold w-6 text-center text-slate-800">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQty(item.productId, true)}
                            className="p-1 hover:bg-slate-50 text-slate-500 rounded"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Descuento unitario */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-slate-400">DESC:</span>
                          <input
                            type="number"
                            min="0"
                            value={item.discount || ""}
                            onChange={(e) => updateCartDiscount(item.productId, parseFloat(e.target.value) || 0)}
                            placeholder="$0"
                            className="w-12 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center text-xs font-mono font-bold text-rose-600 focus:outline-none"
                          />
                        </div>

                        {/* Valor final */}
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-800">${item.total.toFixed(2)}</span>
                          <span className="text-[9px] text-slate-400 block">${item.price} c/u</span>
                        </div>
                      </div>

                      {stockAlert && (
                        <div className="text-[9px] bg-amber-50 text-amber-850 px-2 py-1 rounded border border-amber-200/50 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>¡Advertencia! Excede stock disponible ({maxStock}).</span>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-16 text-slate-300 flex flex-col justify-center items-center gap-2">
                  <Receipt className="w-12 h-12 stroke-1" />
                  <p className="text-xs font-semibold text-slate-400">La factura no contiene prendas seleccionadas.</p>
                </div>
              )}
            </div>
          </div>

          {/* Subtotal calculations block */}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <div className="flex justify-between items-baseline text-xs text-slate-500">
              <span>Subtotal Base 0%</span>
              <span className="font-mono">${subtotal0.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-baseline text-xs text-slate-500">
              <span>Subtotal Base {ivaRate}%</span>
              <span className="font-mono">${subtotalIVA.toFixed(2)}</span>
            </div>

            {sumItemDiscounts > 0 && (
              <div className="flex justify-between items-baseline text-xs text-rose-600 font-semibold">
                <span>Descuento Aplicado</span>
                <span className="font-mono">-${sumItemDiscounts.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between items-baseline text-xs text-slate-500">
              <span>IVA ({ivaRate}%)</span>
              <span className="font-mono">${ivaAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-baseline border-t border-dashed border-slate-100 pt-2 text-slate-850">
              <span className="font-bold text-sm">TOTAL A PAGAR</span>
              <span className="font-mono text-xl font-black text-indigo-700">${grandTotal.toFixed(2)}</span>
            </div>

            {/* Emit Action Button */}
            {saleType === "factura" && !selectedClient ? (
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center text-xs text-amber-800 font-semibold mt-4">
                Por favor, selecciona o registra un cliente antes de emitir.
              </div>
            ) : cartItems.length === 0 ? (
              <div className="bg-indigo-50/30 border border-indigo-100 rounded-xl p-3 text-center text-xs text-indigo-800 font-semibold mt-4">
                Añade alguna prenda del portafolio textil para facturar.
              </div>
            ) : (
              <button
                onClick={triggerSRIInvoicingFlow}
                disabled={isFinishingSale}
                className={`mt-4 w-full py-3 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg transition duration-150 inline-flex items-center justify-center gap-2 ${
                  saleType === "factura" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {saleType === "factura" ? (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Emitir y Validar SRI Ecuador</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    <span>Registrar Recibo Interno</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* HISTORICAL INVOICES BOARD */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
          <FileCheck className="w-4.5 h-4.5 text-indigo-600" />
          <span>Historial de Comprobantes Recientes</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                <th className="p-3">Secuencial</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">RUC / Cédula</th>
                <th className="p-3">Ambiente</th>
                <th className="p-3">Fecha Emisión</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Estado SRI</th>
                <th className="p-3 text-center">RIDE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invoices.length > 0 ? (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-3 font-mono font-bold text-indigo-600">{inv.invoiceNumber}</td>
                    <td className="p-3 font-semibold">{inv.clientName}</td>
                    <td className="p-3 font-mono">{inv.clientIdNumber}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inv.status === "RECIBO_INTERNO"
                          ? "bg-slate-100 text-slate-500 border border-slate-200"
                          : inv.ambiente === "Producción" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {inv.status === "RECIBO_INTERNO" ? "Caja Local" : inv.ambiente}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{new Date(inv.createdAt).toLocaleString("es-EC")}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-950">${inv.total.toFixed(2)}</td>
                    <td className="p-3">
                      {inv.status === "RECIBO_INTERNO" ? (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-150 shadow-sm">
                          <CheckCircle className="w-3 h-3 text-indigo-500" />
                          <span>Recibo Interno</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-805 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>{inv.status}</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setSelectedHistoricalInvoice(inv)}
                        className="px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition inline-flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" />
                        <span>{inv.status === "RECIBO_INTERNO" ? "Recibo" : "RIDE"}</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                    No hay facturas electrónicas emitidas todavía en esta planta de ERP.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SRI EMISSION FLOATING WIZARD MODAL */}
      {isFinishingSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto text-indigo-600 border border-indigo-100">
                {saleType === "factura" ? <Shield className="w-6 h-6 animate-pulse" /> : <Receipt className="w-6 h-6 animate-bounce" />}
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                {saleType === "factura" ? "Transmitiendo Comprobante Electrónico SRI" : "Generando Recibo Interno de Caja"}
              </h3>
              <p className="text-xs text-slate-500">
                {saleType === "factura"
                  ? "Esquema tributario de firmas offline ecuatoriano."
                  : "Control interno operativo y de inventario para Sisa Creaciones."}
              </p>
            </div>

            {saleType === "factura" ? (
              /* Stepper progress layout for SRI */
              <div className="space-y-4">
                {/* Step 1 */}
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  {emissionStep === "xml" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Generación de Esquema XML Factura</h4>
                    <p className="text-[10px] text-slate-400">Validando etiquetas infoTributaria y detalles del SRI...</p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className={`flex items-center gap-3.5 p-3 rounded-xl border transition-all ${
                  emissionStep === "xml" ? "opacity-40 border-slate-100 bg-slate-200/20" : "bg-slate-50 border-slate-100"
                }`}>
                  {emissionStep === "signature" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <CheckCircle className={`w-5 h-5 shrink-0 ${
                      emissionStep === "xml" ? "text-slate-355" : "text-emerald-600"
                    }`} />
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Cifrado y Firma Digital (XAdES-BES)</h4>
                    <p className="text-[10px] text-slate-400">Firmando digitalmente con archivo PKCS12 (.p12) registrado...</p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className={`flex items-center gap-3.5 p-3 rounded-xl border transition-all ${
                  (emissionStep === "xml" || emissionStep === "signature") ? "opacity-40 border-slate-100 bg-slate-200/20" : "bg-slate-50 border-slate-100"
                }`}>
                  {emissionStep === "sri_send" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <CheckCircle className={`w-5 h-5 shrink-0 ${
                      (emissionStep === "xml" || emissionStep === "signature") ? "text-slate-355" : "text-emerald-600"
                    }`} />
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Emisión de Recepción WebService SRI</h4>
                    <p className="text-[10px] text-slate-400">Verificando en ambiente de {ambienteMode} del SRI ecuatoriano...</p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className={`flex items-center gap-3.5 p-3 rounded-xl border transition-all ${
                  emissionStep !== "authorized" && emissionStep !== "done" ? "opacity-40 border-slate-100 bg-slate-200/20" : "bg-emerald-50 border-emerald-100"
                }`}>
                  {emissionStep === "authorized" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <CheckCircle className={`w-5 h-5 shrink-0 ${
                      emissionStep !== "done" ? "text-slate-355" : "text-emerald-600"
                    }`} />
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950">Comprobante Autorizado por el SRI</h4>
                    <p className="text-[10px] text-emerald-700 font-mono select-all">CA: {activeAccessKey || "Calculando..."}</p>
                  </div>
                </div>
              </div>
            ) : (
              /* Local progress layout for Receipt */
              <div className="space-y-4">
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Control de Caja Interno</h4>
                    <p className="text-[10px] text-slate-400 font-mono">Consolidado en venta no declarada</p>
                  </div>
                </div>
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Actualización de Inventario Físico</h4>
                    <p className="text-[10px] text-slate-400 font-mono">Stock de prendas decrementado en tiempo real</p>
                  </div>
                </div>
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Reporte Financiero ERP</h4>
                    <p className="text-[10px] text-slate-400 font-mono">Sincronizado para el cálculo del Punto de Equilibrio</p>
                  </div>
                </div>
              </div>
            )}

            {/* Final Done success details */}
            {emissionStep === "done" && (
              <div className="bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-200 space-y-4 text-center select-none animate-fade-in">
                <p className="text-xs text-indigo-950 font-bold">
                  {saleType === "factura"
                    ? "La transacción se ha consolidado en base de datos. Se descontó stock e ingresó la factura de forma autorizada."
                    : "El recibo se ha registrado de forma interna en caja de Sisa Creaciones. Se actualizó el stock y los reportes financieros en tiempo real."}
                </p>

                {saleType === "recibo" ? (
                  <div className="space-y-4 pt-1">
                    <span className="text-[10px] font-extrabold text-slate-450 uppercase tracking-widest block">Opciones del Recibo de Control</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        onClick={() => {
                          if (emittedInvoiceObject) {
                            handlePrintReceipt(emittedInvoiceObject);
                          }
                        }}
                        className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all duration-150 flex items-center justify-center gap-1.5"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Imprimir Ticket</span>
                      </button>

                      <button
                        onClick={() => {
                          if (emittedInvoiceObject) {
                            handleExportPDF(emittedInvoiceObject);
                          }
                        }}
                        className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all duration-150 flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        <span>Exportar PDF</span>
                      </button>

                      <button
                        onClick={() => {
                          if (emittedInvoiceObject) {
                            handleExportExcel(emittedInvoiceObject);
                          }
                        }}
                        className="px-3 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all duration-150 flex items-center justify-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Exportar Excel</span>
                      </button>
                    </div>

                    <div className="pt-3 border-t border-slate-200">
                      <button
                        onClick={resetBillingLayout}
                        className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition shadow-sm"
                      >
                        Finalizar y Nueva Venta
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => {
                        if (emittedInvoiceObject) {
                          setSelectedHistoricalInvoice(emittedInvoiceObject);
                        }
                      }}
                      className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold shadow hover:bg-slate-800 transition inline-flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Ver Factura (RIDE)</span>
                    </button>
                    <button
                      onClick={resetBillingLayout}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow hover:bg-emerald-700 transition"
                    >
                      Nueva Venta
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RIDE GENERATOR MODAL VIEW */}
      {selectedHistoricalInvoice && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 flex flex-col justify-between my-8 animate-fade-in">
            
            {/* Header Toolbar */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 select-none">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>
                  {selectedHistoricalInvoice.status === "RECIBO_INTERNO"
                    ? "Control de Caja Simplificado - Sisa Creaciones"
                    : "Formato RIDE Autorizado - SRI Ecuador"}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedHistoricalInvoice(null)}
                  className="p-1 px-2 border rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 text-xs font-bold transition"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* THE PAPER RIDE SHEET LAYOUT */}
            <div className="p-4 p-md-8 bg-white border border-slate-100 rounded-xl my-4 space-y-6 font-sans text-xs select-text tracking-wide text-slate-800 overflow-x-auto min-w-[580px]" id="print-ride-sheet">
              
              {/* Emitter & Title block */}
              <div className="grid grid-cols-2 gap-4">
                {/* Sisa Creaciones Company info */}
                <div className="border border-slate-200 p-4 rounded-xl space-y-1.5">
                  <div className="pb-2 flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-slate-900 text-emerald-400 font-bold text-center flex items-center justify-center">S</div>
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-950 uppercase">Sisa Creaciones</h3>
                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Taller Textil ERP</p>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900">{user.name || "Sisa Creaciones S.A."}</p>
                  <p>Dirección Matriz: Quito Centro Industrial, Av. Maldonado y El Sena</p>
                  <p>Dirección Sucursal: Sur de Quito, Parque Industrial Chimbacalle</p>
                  <p className="font-semibold text-slate-900">OBLIGADO A LLEVAR CONTABILIDAD: NO</p>
                  <p className="text-[10px] text-indigo-600 font-bold">CONTRIBUYENTE RÉGIMEN RIMPE</p>
                </div>

                {/* Billing number, clave acceso details */}
                {selectedHistoricalInvoice.status === "RECIBO_INTERNO" ? (
                  <div className="border border-indigo-155 p-4 rounded-xl bg-indigo-50/20 space-y-2">
                    <p className="font-extrabold text-xs text-slate-950">DOCUMENTO DE CONTROL INTERNO</p>
                    <h3 className="text-sm font-black text-indigo-700">RECIBO / NOTA DE VENTA</h3>
                    <p className="font-mono text-xs font-bold">Nº: <span className="text-indigo-600">{selectedHistoricalInvoice.invoiceNumber}</span></p>
                    <div className="text-[10px] text-slate-500 space-y-1">
                      <p className="font-semibold text-slate-750">SISA CREACIONES - CONTROL DE CAJA</p>
                      <p>Este comprobante registra una venta interna simplificada para propósitos de control operativo y cuadraturas de inventario físico.</p>
                      <p className="font-bold text-slate-700">REGISTRADO EN BASE DE DATOS LOCAL</p>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 p-4 rounded-xl space-y-2">
                    <p className="font-extrabold text-xs text-slate-950">R.U.C.: <span className="font-mono">1792345678001</span></p>
                    <h3 className="text-sm font-black text-slate-950">FACTURA</h3>
                    <p className="font-mono text-xs font-bold">Nº: <span className="text-indigo-600">{selectedHistoricalInvoice.invoiceNumber}</span></p>
                    <p className="font-semibold">NÚMERO DE AUTORIZACIÓN:</p>
                    <p className="font-mono text-[9px] text-slate-900 font-bold select-all break-all">{selectedHistoricalInvoice.claveAcceso}</p>
                    <p>AMBIENTE: <span className="font-bold uppercase text-slate-900">{selectedHistoricalInvoice.ambiente}</span></p>
                    <p>EMISIÓN: <span className="font-bold">NORMAL offline</span></p>
                    <div>
                      <span className="font-semibold block">CLAVE DE ACCESO:</span>
                      {/* Simulated barcode using neat UI box */}
                      <div className="bg-slate-900 h-8 w-full mt-1.5 flex items-center justify-center text-emerald-400 font-mono text-[8px] tracking-[4px] rounded select-none">
                        ||| |||| | ||||| | ||| ||||||| |||| |
                      </div>
                      <span className="font-mono text-[8px] text-slate-400 block text-center mt-1">{selectedHistoricalInvoice.claveAcceso}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Client Info Info */}
              <div className="border border-slate-200 p-4 rounded-xl grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                <div>
                  <p><span className="font-bold text-slate-500">Razón Social / Nombres:</span> <span className="font-bold text-slate-950">{selectedHistoricalInvoice.clientName}</span></p>
                  <p><span className="font-bold text-slate-500">Identificación:</span> <span className="font-mono font-bold text-slate-950">{selectedHistoricalInvoice.clientIdNumber}</span></p>
                  <p><span className="font-bold text-slate-500">Fecha Emisión:</span> {new Date(selectedHistoricalInvoice.createdAt).toLocaleDateString("es-EC")}</p>
                </div>
                <div>
                  <p><span className="font-bold text-slate-500">Dirección:</span> Quito, Ecuador</p>
                  <p><span className="font-bold text-slate-500">Email:</span> {selectedHistoricalInvoice.clientEmail}</p>
                  <p><span className="font-bold text-slate-500">Guía de Remisión:</span> Sin Guía</p>
                </div>
              </div>

              {/* Items details table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="p-2.5">Código</th>
                      <th className="p-2.5">Prenda / Detalle</th>
                      <th className="p-2.5">Talla</th>
                      <th className="p-2.5">Color</th>
                      <th className="p-2.5 text-center">Cant.</th>
                      <th className="p-2.5 text-right">Precio Unit.</th>
                      <th className="p-2.5 text-right">Descuento</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {selectedHistoricalInvoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-mono font-bold text-[10px] text-slate-500">CF-{item.size}-{item.color.substring(0, 3).toUpperCase()}</td>
                        <td className="p-2.5 font-bold">{item.name}</td>
                        <td className="p-2.5 text-center">{item.size}</td>
                        <td className="p-2.5">{item.color}</td>
                        <td className="p-2.5 text-center font-bold">{item.quantity}</td>
                        <td className="p-2.5 text-right font-mono">${item.price.toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono text-rose-600">-${item.discount.toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono font-extrabold text-slate-900">${item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Payments block */}
              <div className="grid grid-cols-12 gap-4">
                {/* Information Adicional / Payment details */}
                <div className="col-span-7 border border-slate-200 p-3.5 rounded-xl space-y-1.5">
                  <p className="font-bold text-[10px] uppercase text-indigo-600">Información Adicional</p>
                  <p><span className="font-bold">Email de Contacto:</span> {selectedHistoricalInvoice.clientEmail}</p>
                  <p><span className="font-bold">Dirección:</span> Quito, Ecuador</p>
                  <p><span className="font-bold">Teléfono:</span> 0999999999</p>
                  <p><span className="font-bold">Forma de Pago del SRI:</span> SIN UTILIZACIÓN DEL SISTEMA FINANCIERO (Efectivo/Transferencia)</p>
                </div>

                {/* Subtotals & Grand invoice totals */}
                <div className="col-span-5 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-[11px]">
                  <div className="flex justify-between p-2 font-medium">
                    <span>SUBTOTAL Base 0%</span>
                    <span className="font-mono">$0.00</span>
                  </div>
                  <div className="flex justify-between p-2 font-medium">
                    <span>SUBTOTAL Base {selectedHistoricalInvoice.ivaRate}%</span>
                    <span className="font-mono">${selectedHistoricalInvoice.subtotalIVA.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-2 font-medium text-rose-600 font-bold">
                    <span>TOTAL DESCUENTO</span>
                    <span className="font-mono">-${selectedHistoricalInvoice.discount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-2 font-medium">
                    <span>IVA {selectedHistoricalInvoice.ivaRate}%</span>
                    <span className="font-mono">${selectedHistoricalInvoice.ivaAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-indigo-50 font-extrabold text-indigo-950">
                    <span className="text-xs uppercase">VALOR TOTAL</span>
                    <span className="font-mono text-sm">${selectedHistoricalInvoice.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
