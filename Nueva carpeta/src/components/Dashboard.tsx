import { useEffect, useState } from "react";
import { collection, onSnapshot, query, setDoc, doc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { RawMaterial, FinishedProduct, ProductionOrder, FixedCost, UserProfile } from "../types";
import { 
  TrendingUp, Scissors, Users, AlertTriangle, ChevronRight, Play, Database,
  Shirt, ClipboardList, Wallet, DollarSign, Layers
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, PieChart, Pie } from "recharts";

interface DashboardProps {
  user: UserProfile;
  setActiveTab: (tab: string) => void;
}

export default function Dashboard({ user, setActiveTab }: DashboardProps) {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [loading, setLoading] = useState(true);

  // Load Real-time Data
  useEffect(() => {
    setLoading(true);

    const qMaterials = query(collection(db, "raw_materials"));
    const unsubMaterials = onSnapshot(qMaterials, (snapshot) => {
      const items: RawMaterial[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as RawMaterial);
      });
      setMaterials(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "raw_materials");
    });

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

    const qOrders = query(collection(db, "production_orders"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const items: ProductionOrder[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as ProductionOrder);
      });
      setOrders(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "production_orders");
    });

    const qFixedCosts = query(collection(db, "fixed_costs"));
    const unsubFixedCosts = onSnapshot(qFixedCosts, (snapshot) => {
      const items: FixedCost[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as FixedCost);
      });
      setFixedCosts(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "fixed_costs");
    });

    return () => {
      unsubMaterials();
      unsubProducts();
      unsubOrders();
      unsubFixedCosts();
    };
  }, []);

  // Demo Seeder so the interface is immediately populated
  const seedDemoData = async () => {
    setLoading(true);
    try {
      // 1. Raw Materials Seed
      const demoMaterials: RawMaterial[] = [
        { id: "mat_1", name: "Tela Denim Algodón", category: "Tela", quantity: 65, unit: "metros", minStock: 100, costPerUnit: 4.5, updatedAt: new Date().toISOString() },
        { id: "mat_2", name: "Tela Lino Crudo", category: "Tela", quantity: 210, unit: "metros", minStock: 80, costPerUnit: 6.2, updatedAt: new Date().toISOString() },
        { id: "mat_3", name: "Hilo Poliéster Cono Azul", category: "Hilo", quantity: 12, unit: "conos", minStock: 15, costPerUnit: 1.8, updatedAt: new Date().toISOString() },
        { id: "mat_4", name: "Hilo Espiga Negro", category: "Hilo", quantity: 45, unit: "conos", minStock: 20, costPerUnit: 2.1, updatedAt: new Date().toISOString() },
        { id: "mat_5", name: "Botones Metálicos Bronce", category: "Accesorios", quantity: 1200, unit: "unidades", minStock: 400, costPerUnit: 0.15, updatedAt: new Date().toISOString() },
      ];
      for (const m of demoMaterials) {
        await setDoc(doc(db, "raw_materials", m.id), m);
      }

      // 2. Finished Products Seed
      const demoProducts: FinishedProduct[] = [
        { id: "prod_1", name: "Chaqueta Denim Sisa", type: "Chaqueta", size: "M", color: "Azul Indigo", stock: 45, salePrice: 42.0, materialCostPerUnit: 12.5, laborCostPerUnit: 8.0, updatedAt: new Date().toISOString() },
        { id: "prod_2", name: "Chaqueta Denim Sisa", type: "Chaqueta", size: "L", color: "Azul Indigo", stock: 30, salePrice: 42.0, materialCostPerUnit: 13.5, laborCostPerUnit: 8.0, updatedAt: new Date().toISOString() },
        { id: "prod_3", name: "Camisa Lino Fresh", type: "Camisa", size: "S", color: "Blanco", stock: 80, salePrice: 28.0, materialCostPerUnit: 7.2, laborCostPerUnit: 5.0, updatedAt: new Date().toISOString() },
        { id: "prod_4", name: "Camisa Lino Fresh", type: "Camisa", size: "M", color: "Blanco", stock: 4, salePrice: 28.0, materialCostPerUnit: 7.5, laborCostPerUnit: 5.0, updatedAt: new Date().toISOString() },
        { id: "prod_5", name: "Pantalón Denim Clásico", type: "Pantalón", size: "M", color: "Negro", stock: 55, salePrice: 35.0, materialCostPerUnit: 9.8, laborCostPerUnit: 6.5, updatedAt: new Date().toISOString() },
      ];
      for (const p of demoProducts) {
        await setDoc(doc(db, "finished_products", p.id), p);
      }

      // 3. Production Orders Seed
      const demoOrders: ProductionOrder[] = [
        {
          id: "ord_101",
          orderNumber: "ORD-1502",
          garmentType: "Chaqueta Denim",
          patternUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=300&auto=format&fit=crop",
          quantity: 120,
          size: "M",
          color: "Azul",
          limitDate: "2026-06-15",
          assignedOperatorId: "demo_operator_operaria_lucia",
          assignedOperatorName: "Lucía Confecciones",
          status: "Confección/Costura",
          notes: "Atención reforzada a las costuras reforzadas del bolsillo frontal.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "ord_102",
          orderNumber: "ORD-1503",
          garmentType: "Camisa Lino Fresh",
          patternUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=300&auto=format&fit=crop",
          quantity: 80,
          size: "S",
          color: "Blanco",
          assignedOperatorId: "demo_operator_operario_carlos",
          assignedOperatorName: "Carlos Cortador",
          status: "Corte",
          notes: "Corte exacto según ficha de patronaje número 24.",
          limitDate: "2026-06-20",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "ord_103",
          orderNumber: "ORD-1504",
          garmentType: "Pantalón Denim",
          patternUrl: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=300&auto=format&fit=crop",
          quantity: 50,
          size: "M",
          color: "Negro",
          assignedOperatorId: "demo_operator_operaria_lucia",
          assignedOperatorName: "Lucía Confecciones",
          status: "Control de Calidad",
          notes: "Limpieza de hilos sobrantes requerida.",
          limitDate: "2026-06-12",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "ord_104",
          orderNumber: "ORD-1501",
          garmentType: "Remera Algodón Básica",
          patternUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop",
          quantity: 300,
          size: "L",
          color: "Gris",
          assignedOperatorId: "demo_operator_operario_carlos",
          assignedOperatorName: "Carlos Cortador",
          status: "Listo",
          notes: "Embalado final terminado.",
          limitDate: "2026-05-28",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ];
      for (const o of demoOrders) {
        await setDoc(doc(db, "production_orders", o.id), o);
      }

      // 4. Fixed Costs Seed
      const demoCosts: FixedCost[] = [
        { id: "cost_1", concept: "Arriendo de Taller Textil", amount: 800.0, period: "Mensual", updatedAt: new Date().toISOString() },
        { id: "cost_2", concept: "Energía Trifásica Maquinaria", amount: 180.0, period: "Mensual", updatedAt: new Date().toISOString() },
        { id: "cost_3", concept: "Mantenimiento Preventivo Overlock y Rectas", amount: 120.0, period: "Mensual", updatedAt: new Date().toISOString() },
        { id: "cost_4", concept: "Salarios Administrativos Base", amount: 1500.0, period: "Mensual", updatedAt: new Date().toISOString() },
      ];
      for (const c of demoCosts) {
        await setDoc(doc(db, "fixed_costs", c.id), c);
      }

    } catch (err) {
      console.error("Error seeding database: ", err);
    } finally {
      setLoading(false);
    }
  };

  // Computations
  // Low Stock alarm filter
  const lowStockMaterials = materials.filter(m => m.quantity <= m.minStock);
  const finishedGarmentsTotalVal = products.reduce((acc, p) => acc + (p.stock * p.salePrice), 0);
  const totalStockGarments = products.reduce((acc, p) => acc + p.stock, 0);

  // Produced garments represent quantities of orders completed ("Listo")
  const producedGarmentsCount = orders
    .filter(o => o.status === "Listo")
    .reduce((acc, o) => acc + o.quantity, 0);

  // Active production load represents orders NOT finished
  const activeOrdersInWorkshop = orders.filter(o => o.status !== "Listo");
  const activeGarmentsInProduction = activeOrdersInWorkshop.reduce((acc, o) => acc + o.quantity, 0);

  // Financial Estimates
  const totalMonthlyFixedCost = fixedCosts.reduce((acc, c) => {
    const amt = parseFloat(c.amount as any) || 0;
    return acc + amt;
  }, 0);

  // Status metrics chart data
  const statusCounts = {
    "En Diseño": 0,
    "Corte": 0,
    "Confección/Costura": 0,
    "Acabado/Planchado": 0,
    "Control de Calidad": 0,
    "Empaque": 0,
    "Listo": 0
  };

  orders.forEach(o => {
    if (Object.prototype.hasOwnProperty.call(statusCounts, o.status)) {
      statusCounts[o.status] += o.quantity;
    }
  });

  const chartData = Object.entries(statusCounts).map(([status, qty]) => ({
    name: status,
    Cantidad: qty,
  }));

  // Categories distribution of raw material
  const catSums: Record<string, number> = {};
  materials.forEach(m => {
    catSums[m.category] = (catSums[m.category] || 0) + m.quantity;
  });

  const materialPieData = Object.entries(catSums).map(([cat, val]) => ({
    name: cat,
    value: Math.round(val),
  }));

  const COLORS = ["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-[80vh]">
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-emerald-500 animate-spin mb-4" />
        <p className="text-slate-500 font-sans">Sincronizando con base de datos de producción...</p>
      </div>
    );
  }

  // Handle empty database with lovely onboarding state
  const isDbEmpty = materials.length === 0 && products.length === 0 && orders.length === 0;

  return (
    <div className="space-y-6" id="dashboard-tab">
      {/* Upper header action bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900">Tablero Principal</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user.role === "admin" 
              ? "Vista Administrativa de taller de confección." 
              : `Bienvenido, ${user.name}. Órdenes asignadas y progreso en taller.`}
          </p>
        </div>
      </div>

      {isDbEmpty ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center max-w-2xl mx-auto my-12 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <Scissors className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold font-display text-slate-800">El ERP Sisa Creaciones está listo</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-2 leading-relaxed">
            Has sincronizado la base de datos de producción con Cloud Firestore de manera segura y confidencial. Comienza agregando materias primas o registrando nuevos operarios en la consola de administración.
          </p>
        </div>
      ) : (
        <>
          {/* Alertas de Stock Crítico */}
          {lowStockMaterials.length > 0 && (
            <div className="bg-amber-50 text-amber-900 px-5 py-4 rounded-xl border border-amber-200/50 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between" id="low-stock-alert-panel">
              <div className="flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sm">Alerta de Stock Crítico de Materia Prima</h3>
                  <p className="text-xs text-amber-800/80 mt-0.5">
                    Hay <strong>{lowStockMaterials.length}</strong> materiales textiles por debajo de su reserva de seguridad mínima. El taller podría sufrir retrasos.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab("inventory")}
                className="text-xs font-bold text-amber-700 hover:text-amber-900 bg-white shadow-sm hover:shadow px-3.5 py-1.5 rounded-lg border border-amber-200 shrink-0 transition"
              >
                Ver Almacén
              </button>
            </div>
          )}

          {/* KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" id="kpis-container">
            {/* Produced count */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prendas Producidas</p>
                <h3 className="text-3xl font-bold font-display text-slate-900 mt-1.5">{producedGarmentsCount}</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-none">Terminadas listas ("Listo")</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Shirt className="w-6 h-6" />
              </div>
            </div>

            {/* In workshop progress count */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Órdenes en Taller</p>
                <h3 className="text-3xl font-bold font-display text-slate-900 mt-1.5">{activeOrdersInWorkshop.length}</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-none">
                  {activeGarmentsInProduction} prendas en confección
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <ClipboardList className="w-6 h-6" />
              </div>
            </div>

            {/* Involucrados finished product stock */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stock Producto Terminado</p>
                <h3 className="text-3xl font-bold font-display text-slate-900 mt-1.5">{totalStockGarments}</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-none">En cajas listas para entrega</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <Layers className="w-6 h-6" />
              </div>
            </div>

            {/* Financial Basic stats */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Costos Fijos Mensuales</p>
                <h3 className="text-2xl font-bold font-display text-slate-900 mt-1.5">
                  ${totalMonthlyFixedCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
                <p className="text-[11px] text-emerald-600 font-semibold mt-1 leading-none">Establecido en finanzas</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Charts block */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar chart - Production Orders Load */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2">
              <h3 className="text-base font-bold text-slate-800 mb-4">Carga de Confección/Costura en Taller (Metros/Prendas)</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip cursor={{ fill: "rgba(241, 245, 249, 0.5)" }} />
                    <Bar dataKey="Cantidad" fill="#10b981" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => {
                        let color = "#10b981"; // Confeccion
                        if (entry.name === "Listo") color = "#0284c7"; // Listo
                        if (entry.name === "En Diseño" || entry.name === "Corte") color = "#6366f1"; // Blue
                        if (entry.name === "Control de Calidad") color = "#8b5cf6"; // Purple
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart - Material Inventory Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 mb-4">Distribución de Materia Prima</h3>
              <div className="h-56 relative">
                {materialPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={materialPieData}
                        cx="50%"
                        cy="55%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {materialPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-xs">Sin información</div>
                )}
                {/* Center total */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center mt-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Categorías</span>
                  <span className="text-xl font-bold text-slate-800">{materialPieData.length}</span>
                </div>
              </div>
              {/* Legend list */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {materialPieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                    <span className="text-slate-600 truncate">{entry.name}</span>
                    <span className="text-slate-400 font-mono">({entry.value})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Low Stocks warning list */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <span>Materia Prima en Nivel Alerta</span>
                    {lowStockMaterials.length > 0 && (
                      <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {lowStockMaterials.length}
                      </span>
                    )}
                  </h3>
                  <button 
                    onClick={() => setActiveTab("inventory")}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5"
                  >
                    <span>Gestionar</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {lowStockMaterials.length > 0 ? (
                    lowStockMaterials.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{m.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <span className="bg-slate-200/60 px-1.5 py-0.5 rounded text-[10px]">{m.category}</span>
                            <span>Costo unitario: ${m.costPerUnit}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-600 font-mono">
                            {m.quantity} / {m.minStock}
                          </p>
                          <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Stock Bajo ({m.unit})</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-sm text-slate-400 flex flex-col items-center justify-center gap-2">
                      <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <p>¡Nivel de materia prima óptimo!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Factory workload summary */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <span>Carga Operacional Activa</span>
                    {activeOrdersInWorkshop.length > 0 && (
                      <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {activeOrdersInWorkshop.length}
                      </span>
                    )}
                  </h3>
                  <button 
                    onClick={() => setActiveTab("orders")}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5"
                  >
                    <span>Hoja de ruta</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {activeOrdersInWorkshop.length > 0 ? (
                    activeOrdersInWorkshop.slice(0, 4).map(o => (
                      <div key={o.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-indigo-600 font-mono">{o.orderNumber}</span>
                            <span className="text-sm font-semibold text-slate-800 truncate max-w-[150px]">{o.garmentType}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Operario: <span className="font-medium text-slate-700">{o.assignedOperatorName || "Sin asignar"}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs bg-indigo-500/10 text-indigo-700 font-bold px-2 py-1 rounded inline-block">
                            {o.status}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">Vence {o.limitDate}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-sm text-slate-400 flex flex-col items-center justify-center gap-2">
                      <p>No hay órdenes en confección activas.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
