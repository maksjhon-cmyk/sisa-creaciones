import { useEffect, useState, FormEvent } from "react";
import { collection, onSnapshot, query, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { FixedCost, FinishedProduct, UserProfile, Invoice } from "../types";
import { 
  Building, DollarSign, Plus, Trash2, Calculator, Info, AlertTriangle, TrendingUp, HelpCircle, FileCheck
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";

interface CostsProps {
  user: UserProfile;
}

// Helper to safe-cast values into numbers
const safeNumber = (val: any, fallback = 0): number => {
  if (val === null || val === undefined) return fallback;
  const p = parseFloat(val);
  return isNaN(p) || !isFinite(p) ? fallback : p;
};

export default function Costs({ user }: CostsProps) {
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Form fixed cost states
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState(120);
  const [period, setPeriod] = useState("Mensual");
  const [showCostForm, setShowCostForm] = useState(false);

  // Break Even Calculator selection state (Defaults to manual simulation)
  const [selectedProductId, setSelectedProductId] = useState("manual");
  
  // Custom What-If Override sliders
  const [overridePrice, setOverridePrice] = useState<number | null>(null);
  const [overrideMaterial, setOverrideMaterial] = useState<number | null>(null);
  const [overrideLabor, setOverrideLabor] = useState<number | null>(null);

  // Component-scope isAdmin check
  const isAdmin = user.role === "admin" || user.uid === "Sisa-Creaciones-ERP" || user.email === "maksjhon@gmail.com";

  // Inline edit lists states
  const [isEditingList, setIsEditingList] = useState(false);
  const [editingAmounts, setEditingAmounts] = useState<{ [id: string]: string }>({});
  const [editingConcepts, setEditingConcepts] = useState<{ [id: string]: string }>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  // Populate state with current values upon entering edit mode
  const handleStartEditing = () => {
    const freshAmounts: { [id: string]: string } = {};
    const freshConcepts: { [id: string]: string } = {};
    fixedCosts.forEach((c) => {
      freshAmounts[c.id] = String(c.amount ?? 0);
      freshConcepts[c.id] = c.concept || "";
    });
    setEditingAmounts(freshAmounts);
    setEditingConcepts(freshConcepts);
    setValidationError(null);
    setIsEditingList(true);
  };

  // Validate and bulk-write edits back to Firestore
  const handleSaveAllEdits = async () => {
    if (!isAdmin) return;
    let hasError = false;
    const updates: { id: string; concept: string; amount: number; period: string }[] = [];

    for (const c of fixedCosts) {
      const editConcept = (editingConcepts[c.id] ?? c.concept).trim();
      const rawVal = editingAmounts[c.id] ?? String(c.amount);
      const editAmount = parseFloat(rawVal);

      if (!editConcept) {
        setValidationError(`El concepto no puede estar vacío.`);
        hasError = true;
        break;
      }

      if (isNaN(editAmount) || editAmount < 0) {
        setValidationError(`El monto para "${editConcept}" debe ser un valor numérico mayor o igual a cero.`);
        hasError = true;
        break;
      }

      updates.push({
        id: c.id,
        concept: editConcept,
        amount: editAmount,
        period: c.period,
      });
    }

    if (hasError) return;
    setValidationError(null);

    try {
      const savePromises = updates.map((up) => {
        const docRef = doc(db, "fixed_costs", up.id);
        return setDoc(docRef, {
          concept: up.concept,
          amount: up.amount,
          period: up.period,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await Promise.all(savePromises);
      setIsEditingList(false);
    } catch (err) {
      console.error("Error saving updated fixed costs:", err);
      handleFirestoreError(err, OperationType.UPDATE, "fixed_costs");
    }
  };

  // Real-time synchronization
  useEffect(() => {
    setLoading(true);

    let unsubCosts = () => {};

    try {
      if (isAdmin) {
        const qCosts = query(collection(db, "fixed_costs"));
        unsubCosts = onSnapshot(qCosts, (snapshot) => {
          const items: FixedCost[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data) {
              items.push({
                id: docSnap.id,
                concept: data.concept || "Costo sin concepto",
                amount: safeNumber(data.amount, 0),
                period: data.period || "Mensual",
                updatedAt: data.updatedAt || new Date().toISOString()
              });
            }
          });
          setFixedCosts(items);
        }, (error) => {
          console.error("Error reading fixed costs: ", error);
          handleFirestoreError(error, OperationType.LIST, "fixed_costs");
        });
      } else {
        // Operators view simulated read-only costs safely
        setFixedCosts([
          { id: "cost_1", concept: "Arriendo de Taller (Lectura)", amount: 800.0, period: "Mensual", updatedAt: new Date().toISOString() },
          { id: "cost_2", concept: "Energía Eléctrica (Lectura)", amount: 150.0, period: "Mensual", updatedAt: new Date().toISOString() },
          { id: "cost_3", concept: "Mantenimiento Preventivo (Lectura)", amount: 100.0, period: "Mensual", updatedAt: new Date().toISOString() },
          { id: "cost_4", concept: "Salarios Administrativos (Lectura)", amount: 1200.0, period: "Mensual", updatedAt: new Date().toISOString() },
        ]);
      }
    } catch (err) {
      console.error("Error setting up fixed costs subscription: ", err);
    }

    let unsubProducts = () => {};
    try {
      const qProducts = query(collection(db, "finished_products"));
      unsubProducts = onSnapshot(qProducts, (snapshot) => {
        const items: FinishedProduct[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data) {
            items.push({
              id: docSnap.id,
              name: data.name || "Prenda sin nombre",
              type: data.type || "General",
              size: data.size || "M",
              color: data.color || "N/A",
              stock: safeNumber(data.stock, 0),
              salePrice: safeNumber(data.salePrice, 0),
              materialCostPerUnit: safeNumber(data.materialCostPerUnit, 0),
              laborCostPerUnit: safeNumber(data.laborCostPerUnit, 0),
              updatedAt: data.updatedAt || new Date().toISOString()
            });
          }
        });
        setProducts(items);
      }, (error) => {
        console.error("Error loading finished products: ", error);
        handleFirestoreError(error, OperationType.LIST, "finished_products");
      });
    } catch (err) {
      console.error("Error setting up products subscription: ", err);
    }

    let unsubInvoices = () => {};
    try {
      const qInvoices = query(collection(db, "invoices"));
      unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
        const items: Invoice[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data) {
            items.push(data as Invoice);
          }
        });
        setInvoices(items);
        setLoading(false);
      }, (error) => {
        console.error("Error loading invoices: ", error);
        handleFirestoreError(error, OperationType.LIST, "invoices");
        setLoading(false);
      });
    } catch (err) {
      console.error("Error setting up invoices subscription: ", err);
      setLoading(false);
    }

    return () => {
      unsubCosts();
      unsubProducts();
      unsubInvoices();
    };
  }, [user.role, user.uid, user.email, isAdmin]);

  // Safe reset slider overrides based on selectedProductId inside a stable effect
  useEffect(() => {
    try {
      if (selectedProductId === "manual" || !selectedProductId) {
        setOverridePrice(0);
        setOverrideMaterial(0);
        setOverrideLabor(0);
      } else {
        const match = products.find((p) => p.id === selectedProductId);
        if (match) {
          setOverridePrice(safeNumber(match.salePrice, 40));
          setOverrideMaterial(safeNumber(match.materialCostPerUnit, 10));
          setOverrideLabor(safeNumber(match.laborCostPerUnit, 8));
        }
      }
    } catch (e) {
      console.error("Error during slider overrides reset: ", e);
      setOverridePrice(0);
      setOverrideMaterial(0);
      setOverrideLabor(0);
    }
  }, [selectedProductId, products.length]);

  // Safe wrapper for calculations to prevent any visual crash/white screen
  let totalFixedCosts = 0;
  let selectedProduct: FinishedProduct | undefined = undefined;
  let activePrice = 0;
  let activeMaterial = 0;
  let activeLabor = 0;
  let activeVariableCost = 0;
  let contributionMargin = 0;
  let breakEvenPointUnits = 0;
  let chartData: any[] = [];
  let isDbEmpty = true;
  let calculationError = false;

  // Real world invoicing flow-connected comparisons
  const totalSales = invoices
    .filter(inv => inv.status === "AUTORIZADO" || inv.status === "RECIBO_INTERNO")
    .reduce((acc, inv) => acc + safeNumber(inv.total, 0), 0);

  const totalUnitsSold = invoices
    .filter(inv => inv.status === "AUTORIZADO" || inv.status === "RECIBO_INTERNO")
    .reduce((acc, inv) => acc + inv.items.reduce((sum, item) => sum + safeNumber(item.quantity, 0), 0), 0);

  const salesCoveragePercent = totalFixedCosts >= 0 ? 0 : 0; // Calculated below once totalFixedCosts is computed

  try {
    // 1. Calculate fijos
    totalFixedCosts = fixedCosts.reduce((acc, c) => acc + (c ? safeNumber(c.amount, 0) : 0), 0);

    // 2. Select product template
    if (selectedProductId === "manual" || products.length === 0) {
      selectedProduct = {
        id: "manual",
        name: "Simulación de Prenda Libre",
        type: "Personalizado",
        size: "Única",
        color: "N/A",
        stock: 0,
        salePrice: 0,
        materialCostPerUnit: 0,
        laborCostPerUnit: 0,
        updatedAt: new Date().toISOString()
      };
    } else {
      selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];
    }

    // 3. Assign pricing/cost details
    if (selectedProduct) {
      activePrice = overridePrice !== null ? overridePrice : safeNumber(selectedProduct.salePrice, 0);
      activeMaterial = overrideMaterial !== null ? overrideMaterial : safeNumber(selectedProduct.materialCostPerUnit, 0);
      activeLabor = overrideLabor !== null ? overrideLabor : safeNumber(selectedProduct.laborCostPerUnit, 0);
    }

    activeVariableCost = activeMaterial + activeLabor;
    contributionMargin = activePrice - activeVariableCost;

    // 4. Compute Volume
    if (contributionMargin > 0 && isFinite(contributionMargin)) {
      const calculated = Math.ceil(totalFixedCosts / contributionMargin);
      if (!isNaN(calculated) && isFinite(calculated)) {
        breakEvenPointUnits = calculated;
      }
    }

    isDbEmpty = fixedCosts.length === 0;

    // 5. Generate chart data safely
    const generateChartCoordinates = () => {
      // If margin <= 0, or zero costs, show a default flat simulator graph
      if (contributionMargin <= 0 || breakEvenPointUnits <= 0) {
        return Array.from({ length: 11 }, (_, i) => {
          const units = i * 10;
          return {
            unidades: units,
            CostoFijo: totalFixedCosts,
            CostoTotal: totalFixedCosts + (units * activeVariableCost),
            Ingresos: units * activePrice,
          };
        });
      }

      // Limit max units to render to prevent Recharts layout performance crashes (cap at 20000)
      const graphUnitCap = Math.min(Math.max(breakEvenPointUnits * 1.8, 50), 20000);
      const step = Math.ceil(graphUnitCap / 10) || 5;

      return Array.from({ length: 12 }, (_, i) => {
        const units = Math.round(i * step);
        return {
          unidades: units,
          CostoFijo: totalFixedCosts,
          CostoTotal: totalFixedCosts + (units * activeVariableCost),
          Ingresos: units * activePrice,
        };
      });
    };

    chartData = generateChartCoordinates();

  } catch (err) {
    console.warn("Failsafe mathematical parser activated due to parsing error:", err);
    calculationError = true;
    totalFixedCosts = 0;
    activePrice = 0;
    activeMaterial = 0;
    activeLabor = 0;
    activeVariableCost = 0;
    contributionMargin = 0;
    breakEvenPointUnits = 0;
    chartData = [];
    isDbEmpty = true;
  }

  const handleSaveFixedCost = async (e: FormEvent) => {
    e.preventDefault();
    if (user.role !== "admin") return;
    try {
      const cleanConcept = concept.trim();
      const cleanAmount = Math.max(0, safeNumber(amount, 0));
      if (!cleanConcept) return;

      const id = `cost_${Date.now()}`;
      const payload: FixedCost = {
        id,
        concept: cleanConcept,
        amount: cleanAmount,
        period,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "fixed_costs", id), payload);
      setConcept("");
      setShowCostForm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "fixed_costs");
    }
  };

  const handleDeleteFixedCost = async (id: string) => {
    if (user.role !== "admin") return;
    if (!window.confirm("¿Seguro que deseas eliminar este costo fijo mensual?")) return;
    try {
      await deleteDoc(doc(db, "fixed_costs", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "fixed_costs");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-[60vh]">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-emerald-500 animate-spin mb-4" />
        <p className="text-slate-500 text-sm font-medium">Calculando estadísticas financieras...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" id="finances-tab">
      {/* Upper Title Banner */}
      <div className="border-b border-slate-100 pb-5">
        <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900">Costos y Punto de Equilibrio</h1>
        <p className="text-sm text-slate-500 mt-1">Sistemas de costeo interactivo y simulación de utilidades para el taller textil.</p>
      </div>

      {calculationError && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <span className="font-bold">Nota de simulación:</span> Hubo un reajuste automático en las variables matemáticas por inconsistencia de datos. El simulador ha sido reiniciado con valores en cero listos para completar de forma segura.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Estructura de Costos Fijos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between lg:col-span-1">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">Estructura de Costos Fijos</h3>
                <p className="text-[11px] text-slate-500">Gastos mensuales fijos del taller (arriendo, agua, electricidad, base).</p>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {isEditingList ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingList(false);
                          setValidationError(null);
                        }}
                        className="py-1 px-2 text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAllEdits}
                        className="py-1 px-2.5 text-[11px] font-bold text-white bg-emerald-600 border border-emerald-700 rounded-lg hover:bg-emerald-700 transition"
                      >
                        Guardar Cambios
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartEditing}
                      disabled={fixedCosts.length === 0}
                      className="py-1 px-2.5 text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-205 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Editar
                    </button>
                  )}

                  {!isEditingList && (
                    <button
                      type="button"
                      onClick={() => setShowCostForm(!showCostForm)}
                      className="py-1 px-2.5 text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100/60 transition inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Añadir</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Validation errors for inline list edits */}
            {validationError && (
              <div className="bg-red-50 text-red-800 text-xs p-2.5 rounded-xl border border-red-150 mb-3 font-semibold text-center flex items-center justify-center gap-1.5 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Quick Add cost popup */}
            {showCostForm && (
              <form onSubmit={handleSaveFixedCost} className="bg-slate-50 p-3 rounded-xl border border-slate-150 mb-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700">Registrar Costo Fijo</h4>
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Concepto (ej: Arriendo taller)"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">$</span>
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="Monto"
                      value={amount || ""}
                      onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-xs text-right font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Mensual">Mensual</option>
                    <option value="Anual">Anual</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCostForm(false)}
                    className="flex-1 text-[11px] bg-slate-200 text-slate-600 hover:bg-slate-300 py-1.5 rounded-lg font-bold transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 text-[11px] bg-slate-900 text-white hover:bg-slate-800 py-1.5 rounded-lg font-bold transition"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            )}

            {/* Fijos items layout */}
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {fixedCosts.map((c) => {
                if (isEditingList) {
                  const currentAmount = editingAmounts[c.id] ?? String(c.amount);
                  const currentConcept = editingConcepts[c.id] ?? c.concept;
                  const parsedVal = parseFloat(currentAmount);
                  const isInvalidAmount = isNaN(parsedVal) || parsedVal < 0;
                  const isInvalidConcept = !currentConcept.trim();

                  return (
                    <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 animate-fade-in">
                      <div className="flex gap-2">
                        {/* Concept inline edit */}
                        <div className="flex-1">
                          <span className="text-[9px] text-[#555] block font-bold mb-0.5">CONCEPTO</span>
                          <input
                            type="text"
                            value={currentConcept}
                            onChange={(e) => {
                              setEditingConcepts((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }));
                            }}
                            className={`w-full bg-white border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 ${
                              isInvalidConcept 
                                ? "border-red-400 focus:ring-red-500 text-red-900 bg-red-50" 
                                : "border-slate-200 focus:ring-indigo-500 text-slate-800"
                            }`}
                            placeholder="Ej: Arriendo"
                          />
                        </div>

                        {/* Amount inline edit */}
                        <div className="w-24">
                          <span className="text-[9px] text-[#555] block font-bold mb-0.5">MONTO ($)</span>
                          <div className="relative">
                            <span className="absolute left-1.5 top-1 text-xs text-slate-400 font-mono">$</span>
                            <input
                              type="text"
                              value={currentAmount}
                              onChange={(e) => {
                                setEditingAmounts((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }));
                              }}
                              className={`w-full bg-white border rounded-lg pl-4 pr-1.5 py-1 text-xs text-right font-mono focus:outline-none focus:ring-1 ${
                                isInvalidAmount
                                  ? "border-red-400 focus:ring-red-500 text-red-900 bg-red-50"
                                  : "border-slate-200 focus:ring-indigo-500 text-slate-800"
                              }`}
                              placeholder="0.0"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400 uppercase tracking-wider font-semibold">{c.period}</span>
                        {(isInvalidAmount || isInvalidConcept) && (
                          <span className="text-red-500 font-semibold text-[10px]">
                            {isInvalidConcept ? "Concepto requerido" : "Monto inválido (debe ser ≥ 0)"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={c.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{c.concept}</p>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{c.period}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-800">${safeNumber(c.amount).toFixed(2)}</span>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteFixedCost(c.id)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isDbEmpty && (
                <div className="text-center py-10 bg-slate-25/50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs p-4">
                  No hay costos fijos configurados. Ingresa tus costos para habilitar análisis financieros avanzados.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4 bg-slate-50/50 p-3 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Costos Fijos Totales:</span>
              <span className="text-xl font-bold font-display text-slate-900 font-mono">
                ${totalFixedCosts.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Real Invoice sales connection layout */}
          <div className="border-t border-slate-100 pt-5 mt-5 space-y-4">
            <div className="flex items-center gap-2 pb-1 text-slate-850 font-bold text-xs uppercase tracking-wider">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Flujo de Caja Real Sincronizado</span>
            </div>
            
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-3.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-500 font-medium">Ventas por Facturación (SRI):</span>
                <span className="font-mono text-base font-extrabold text-emerald-600">
                  ${totalSales.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-500 font-medium">Prendas Vendidas:</span>
                <span className="font-mono text-sm font-extrabold text-slate-800">
                  {totalUnitsSold} uds
                </span>
              </div>

              {/* Progress Bar of fixed cost coverage */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-500">Cobertura de Costes Fijos:</span>
                  <span className={`${(totalFixedCosts > 0 ? Math.min(100, Math.round((totalSales / totalFixedCosts) * 100)) : 100) >= 100 ? "text-emerald-600" : "text-amber-600"}`}>
                    {totalFixedCosts > 0 ? `${Math.min(100, Math.round((totalSales / totalFixedCosts) * 100))}%` : "100% (Sin costes)"}
                  </span>
                </div>
                <div className="w-full bg-slate-205 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${
                      (totalFixedCosts > 0 ? Math.round((totalSales / totalFixedCosts) * 100) : 100) >= 100 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${totalFixedCosts > 0 ? Math.min(100, Math.round((totalSales / totalFixedCosts) * 100)) : 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  {totalSales >= totalFixedCosts 
                    ? "✓ Las ventas reales han cubierto el 100% de los costos directos fijos mensuales. Todo ingreso adicional representa rentabilidad neta."
                    : `⟳ Faltan $${Math.max(0, totalFixedCosts - totalSales).toLocaleString("en-US", { minimumFractionDigits: 2 })} para cubrir los costes de operación con las ventas reales.`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns - Simulador de Punto de Equilibrio interactivo */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-50 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Calculator className="w-5 h-5 text-emerald-500" />
                <span>Simulador de Punto de Equilibrio Textil</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Determina la meta de producción requerida para cubrir costos operativos y empezar a generar ganancias.</p>
            </div>

            {/* Select product dropdown */}
            <div>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="bg-slate-100 hover:bg-slate-150 text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:ring-1 focus:ring-slate-400 focus:outline-none font-bold cursor-pointer transition"
              >
                <option value="manual">-- Simulación Libre (Valores de Prueba) --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.size} - {p.color})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Configurable Sliders and Values */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-150">
            {/* Sale Price Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-500">PVP de Venta:</span>
                <span className="font-mono text-indigo-700 font-bold">${activePrice.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="150"
                step="0.5"
                value={activePrice}
                onChange={(e) => setOverridePrice(parseFloat(e.target.value) || 0)}
                className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>$0</span>
                <span>Ajuste interactivo</span>
                <span>$150</span>
              </div>
            </div>

            {/* Fabric Price slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-500">Materia Prima Unit.</span>
                <span className="font-mono text-emerald-700 font-bold">${activeMaterial.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="0.2"
                value={activeMaterial}
                onChange={(e) => setOverrideMaterial(parseFloat(e.target.value) || 0)}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>$0</span>
                <span>Costo de insumos</span>
                <span>$50</span>
              </div>
            </div>

            {/* Labor cost slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-500">Mano de Obra / Costura</span>
                <span className="font-mono text-violet-700 font-bold">${activeLabor.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="0.2"
                value={activeLabor}
                onChange={(e) => setOverrideLabor(parseFloat(e.target.value) || 0)}
                className="w-full accent-violet-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>$0</span>
                <span>Pago por costura</span>
                <span>$50</span>
              </div>
            </div>
          </div>

          {/* Core Results Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="break-even-scores">
            <div className="p-3.5 bg-white rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Margen de Contribución</span>
              <span className="text-lg font-bold font-mono text-indigo-600 mt-1 block">
                ${contributionMargin.toFixed(2)}
              </span>
              <p className="text-[9px] text-slate-500 mt-0.5">Precio menos costos variables</p>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-slate-100 shadow-sm text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Costo Variable Unit.</span>
              <span className="text-lg font-bold font-mono text-slate-800 mt-1 block">
                ${activeVariableCost.toFixed(2)}
              </span>
              <p className="text-[9px] text-slate-500 mt-0.5">Suma de materia prima y mod</p>
            </div>

            <div className="p-3.5 bg-emerald-500/10 text-emerald-950 rounded-xl border border-emerald-500/20 text-center relative overflow-hidden">
              <div className="absolute -right-2 -bottom-2 opacity-5">
                <TrendingUp className="w-16 h-16 text-emerald-900" />
              </div>
              <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Volumen de Equilibrio (Q)</span>
              {contributionMargin <= 0 ? (
                <span className="text-sm font-bold text-red-600 mt-1.5 block">Precios Inviables</span>
              ) : (
                <span className="text-2xl font-bold font-mono text-emerald-800 mt-0.5 block animate-pulse">
                  {breakEvenPointUnits} <span className="text-xs font-semibold text-emerald-700">uds</span>
                </span>
              )}
              <p className="text-[9px] text-emerald-800/80 mt-0.5 font-medium">Prendas mínimas a fabricar</p>
            </div>
          </div>

          {/* Invialibility alert if margin <= 0 */}
          {contributionMargin <= 0 ? (
            <div className="bg-red-50 text-red-800 text-xs p-4 rounded-xl border border-red-200 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold">Estructura de Precios Inviable</h5>
                <p className="text-red-700/95 mt-0.5">
                  El costo variable unitario de confección (${activeVariableCost.toFixed(2)}) es igual o superior que su precio de venta sugerido (${activePrice.toFixed(2)}). El punto de equilibrio es inalcanzable de este modo. Aumente el PVP de la prenda con el regulador o reduzca costes unitarios de costura/materiales.
                </p>
              </div>
            </div>
          ) : (
            /* Graph coordinate visualizer using Recharts safely */
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-150">
              <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
                <span>Gráfica interactiva de Punto de Equilibrio - {selectedProduct?.name || "Simulación"}</span>
                <span className="font-mono text-[10px] text-slate-400">Pto. Equilibrio: {breakEvenPointUnits} uds</span>
              </h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="unidades" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    
                    {/* Graph Curves */}
                    <Line type="monotone" dataKey="Ingresos" name="Ventas / Ingresos ($)" stroke="#4f46e5" strokeWidth={2.5} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="CostoTotal" name="Costo Total ($)" stroke="#ef4444" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="CostoFijo" name="Costo Fijo ($)" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5} />

                    {/* Green Reference Line indicating exact Break-Even Volume */}
                    {breakEvenPointUnits > 0 && (
                      <ReferenceLine 
                        x={breakEvenPointUnits} 
                        stroke="#10b981" 
                        strokeWidth={2.5} 
                        label={{ 
                          value: `Q* = ${breakEvenPointUnits} uds`, 
                          fill: '#047857', 
                          fontSize: 11, 
                          fontWeight: 'bold',
                          position: 'insideTopLeft' 
                        }} 
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex items-start gap-2 bg-indigo-50 border border-indigo-100 p-2.5 rounded-lg text-[11px] text-indigo-900 leading-relaxed">
                <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold">¿Cómo leer la gráfica?</span> El punto de equilibrio (intersección <span className="font-semibold text-emerald-700 font-mono">Q*</span>) marca el límite donde los ingresos por ventas (línea azul) superan por fin al costo integral acumulado (línea roja). Al fabricar más unidades de ese umbral, toda costura genera rentabilidad líquida neta para el taller.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
