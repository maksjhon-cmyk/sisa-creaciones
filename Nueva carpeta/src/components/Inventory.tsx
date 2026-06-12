import { useEffect, useState, FormEvent } from "react";
import { collection, onSnapshot, query, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { RawMaterial, FinishedProduct, UserProfile } from "../types";
import { 
  Layers, Plus, Trash2, Edit3, ShieldAlert, CheckCircle, PackageOpen, AlertCircle, ShoppingCart, Scissors, DollarSign
} from "lucide-react";

interface InventoryProps {
  user: UserProfile;
}

export default function Inventory({ user }: InventoryProps) {
  const [activeTab, setActiveTab2] = useState<"materials" | "products">("materials");
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [matName, setMatName] = useState("");
  const [matCategory, setMatCategory] = useState("Tela");
  const [matQuantity, setMatQuantity] = useState(0);
  const [matUnit, setMatUnit] = useState("metros");
  const [matMinStock, setMatMinStock] = useState(10);
  const [matCost, setMatCost] = useState(1.0);

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<FinishedProduct | null>(null);
  const [prodName, setProdName] = useState("");
  const [prodType, setProdType] = useState("Camiseta");
  const [prodSize, setProdSize] = useState("M");
  const [prodColor, setProdColor] = useState("");
  const [prodStock, setProdStock] = useState(0);
  const [prodPrice, setProdPrice] = useState(10.0);
  const [prodMaterialCost, setProdMaterialCost] = useState(3.0);
  const [prodLaborCost, setProdLaborCost] = useState(2.0);

  // Real-time listener
  useEffect(() => {
    setLoading(true);

    const qMaterials = query(collection(db, "raw_materials"));
    const unsubMaterials = onSnapshot(qMaterials, (snapshot) => {
      const items: RawMaterial[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as RawMaterial);
      });
      setMaterials(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "raw_materials");
    });

    const qProducts = query(collection(db, "finished_products"));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const items: FinishedProduct[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as FinishedProduct);
      });
      setProducts(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "finished_products");
    });

    return () => {
      unsubMaterials();
      unsubProducts();
    };
  }, []);

  // Handlers for Materials
  const handleOpenMaterialForm = (item?: RawMaterial) => {
    if (item) {
      setEditingMaterial(item);
      setMatName(item.name);
      setMatCategory(item.category);
      setMatQuantity(item.quantity);
      setMatUnit(item.unit);
      setMatMinStock(item.minStock);
      setMatCost(item.costPerUnit);
    } else {
      setEditingMaterial(null);
      setMatName("");
      setMatCategory("Tela");
      setMatQuantity(100);
      setMatUnit("metros");
      setMatMinStock(50);
      setMatCost(5.0);
    }
    setShowMaterialForm(true);
  };

  const handleSaveMaterial = async (e: FormEvent) => {
    e.preventDefault();
    if (user.role !== "admin") return;
    try {
      const id = editingMaterial ? editingMaterial.id : `mat_${Date.now()}`;
      const payload: RawMaterial = {
        id,
        name: matName,
        category: matCategory,
        quantity: Number(matQuantity),
        unit: matUnit,
        minStock: Number(matMinStock),
        costPerUnit: Number(matCost),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "raw_materials", id), payload);
      setShowMaterialForm(false);
    } catch (err) {
      handleFirestoreError(err, editingMaterial ? OperationType.UPDATE : OperationType.CREATE, "raw_materials");
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (user.role !== "admin") return;
    if (!window.confirm("¿Seguro que deseas eliminar esta materia prima?")) return;
    try {
      await deleteDoc(doc(db, "raw_materials", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "raw_materials");
    }
  };

  // Handlers for Products
  const handleOpenProductForm = (item?: FinishedProduct) => {
    if (item) {
      setEditingProduct(item);
      setProdName(item.name);
      setProdType(item.type);
      setProdSize(item.size);
      setProdColor(item.color);
      setProdStock(item.stock);
      setProdPrice(item.salePrice);
      setProdMaterialCost(item.materialCostPerUnit);
      setProdLaborCost(item.laborCostPerUnit);
    } else {
      setEditingProduct(null);
      setProdName("");
      setProdType("Chaqueta");
      setProdSize("M");
      setProdColor("Azul Marino");
      setProdStock(50);
      setProdPrice(39.9);
      setProdMaterialCost(12.0);
      setProdLaborCost(8.0);
    }
    setShowProductForm(true);
  };

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (user.role !== "admin") return;
    try {
      const id = editingProduct ? editingProduct.id : `prod_${Date.now()}`;
      const payload: FinishedProduct = {
        id,
        name: prodName,
        type: prodType,
        size: prodSize,
        color: prodColor,
        stock: Number(prodStock),
        salePrice: Number(prodPrice),
        materialCostPerUnit: Number(prodMaterialCost),
        laborCostPerUnit: Number(prodLaborCost),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "finished_products", id), payload);
      setShowProductForm(false);
    } catch (err) {
      handleFirestoreError(err, editingProduct ? OperationType.UPDATE : OperationType.CREATE, "finished_products");
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (user.role !== "admin") return;
    if (!window.confirm("¿Seguro que deseas eliminar este producto terminado?")) return;
    try {
      await deleteDoc(doc(db, "finished_products", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "finished_products");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-[60vh]">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-emerald-500 animate-spin mb-4" />
        <p className="text-slate-500 text-sm">Cargando inventarios textiles...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="inventory-tab">
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900">Control de Inventarios</h1>
          <p className="text-sm text-slate-500 mt-1">Materias primas y almacenamiento de prendas terminadas</p>
        </div>

        {/* Action Toggle Tab */}
        <div className="bg-slate-100 p-1 rounded-xl flex items-center shrink-0 self-start" id="inventory-tab-selector">
          <button
            onClick={() => setActiveTab2("materials")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === "materials"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
            id="tab-materials"
          >
            Materias Primas
          </button>
          <button
            onClick={() => setActiveTab2("products")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === "products"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
            id="tab-products"
          >
            Prendas Terminadas
          </button>
        </div>
      </div>

      {/* Tabs panels */}
      {activeTab === "materials" ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" id="materials-inventory-panel">
          {/* Header section on tab */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-slate-800">Almacén de Materia Prima</h3>
              <p className="text-xs text-slate-500 mt-0.5">Telas, hilos y herrajes de costura activos.</p>
            </div>

            {user.role === "admin" && (
              <button
                onClick={() => handleOpenMaterialForm()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                id="add-material-btn"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Material</span>
              </button>
            )}
          </div>

          {/* Table list */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="materials-table">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/35">
                  <th className="py-3 px-5">Material / Insumo</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">Cantidad Actual</th>
                  <th className="py-3 px-4">Stock Mínimo</th>
                  <th className="py-3 px-4">Costo / Unidad</th>
                  <th className="py-3 px-4 text-center">Estado Alerta</th>
                  {user.role === "admin" && <th className="py-3 px-5 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {materials.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                      No hay materias primas registradas.
                    </td>
                  </tr>
                ) : (
                  materials.map((m) => {
                    const isAlert = m.quantity <= m.minStock;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-5 font-semibold text-slate-800">{m.name}</td>
                        <td className="py-3.5 px-4 text-slate-500 text-xs">
                          <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded">
                            {m.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                          {m.quantity} <span className="text-xs font-normal text-slate-400">{m.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {m.minStock} <span className="text-xs text-slate-400">{m.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700 font-medium">${m.costPerUnit.toFixed(2)}</td>
                        <td className="py-3.5 px-4 text-center">
                          {isAlert ? (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded-full text-xs font-semibold border border-amber-200/50">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Stock Crítico</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full text-xs font-semibold border border-emerald-200/50">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Óptimo</span>
                            </span>
                          )}
                        </td>
                        {user.role === "admin" && (
                          <td className="py-3.5 px-5 text-right space-x-1">
                            <button
                              onClick={() => handleOpenMaterialForm(m)}
                              className="p-1.5 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-lg transition inline-block"
                              title="Editar"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteMaterial(m.id)}
                              className="p-1.5 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition inline-block"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Products terminados tab */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" id="products-inventory-panel">
          {/* Header section finished garments */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-slate-800">Almacén de Prendas de Ropa</h3>
              <p className="text-xs text-slate-500 mt-0.5">Control de productos confeccionados para envío.</p>
            </div>

            {user.role === "admin" && (
              <button
                onClick={() => handleOpenProductForm()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                id="add-product-btn"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Prenda</span>
              </button>
            )}
          </div>

          {/* Table finished garments list */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="products-table">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/35">
                  <th className="py-3 px-5">Nombre Prenda</th>
                  <th className="py-3 px-4">Talla</th>
                  <th className="py-3 px-4">Color</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Unidades en Stock</th>
                  <th className="py-3 px-4">Precio Venta</th>
                  <th className="py-3 px-4">Costo Variable Est.</th>
                  {user.role === "admin" && <th className="py-3 px-5 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400 text-xs">
                      No hay productos terminados registrados.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const variableCost = p.materialCostPerUnit + p.laborCostPerUnit;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3.5 px-5 font-semibold text-slate-800">{p.name}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-600">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs">
                            {p.size}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">{p.color}</td>
                        <td className="py-3.5 px-4 text-slate-500 text-xs">{p.type}</td>
                        <td className="py-3.5 px-4">
                          {p.stock === 0 ? (
                            <span className="text-red-500 font-bold font-mono">Agotado (0 ud)</span>
                          ) : p.stock < 10 ? (
                            <span className="text-amber-600 font-bold font-mono">{p.stock} ud (Bajo)</span>
                          ) : (
                            <span className="text-slate-800 font-bold font-mono">{p.stock} ud</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-emerald-700 font-bold">${p.salePrice.toFixed(2)}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          ${variableCost.toFixed(2)}
                          <span className="text-[10px] text-slate-400 block">
                            (Mat: ${p.materialCostPerUnit} + Cost: ${p.laborCostPerUnit})
                          </span>
                        </td>
                        {user.role === "admin" && (
                          <td className="py-3.5 px-5 text-right space-x-1">
                            <button
                              onClick={() => handleOpenProductForm(p)}
                              className="p-1.5 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-lg transition inline-block"
                              title="Editar"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="p-1.5 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition inline-block"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Popups & Modals Forms (Admin Only) */}
      {/* ------------------------------------------------------------- */}

      {/* Material Form MODAL */}
      {showMaterialForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <h3 className="font-bold font-display text-base">
                {editingMaterial ? "Modificar Insumo Textil" : "Registrar Nueva Materia Prima"}
              </h3>
              <button 
                onClick={() => setShowMaterialForm(false)} 
                className="text-slate-400 hover:text-white font-bold px-2 rounded hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Insumo / Telas</label>
                <input
                  type="text"
                  required
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:border-emerald-500 transition"
                  placeholder="Ej. Algodón Premium 100%"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Categoría</label>
                  <select
                    value={matCategory}
                    onChange={(e) => setMatCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition"
                  >
                    <option value="Tela">Tela (metros)</option>
                    <option value="Hilo">Hilo (conos)</option>
                    <option value="Hebillas">Hebillas</option>
                    <option value="Cierres">Cierres</option>
                    <option value="Botones">Botones</option>
                    <option value="Accesorios">Accesorios</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Unidad de Medida</label>
                  <input
                    type="text"
                    required
                    value={matUnit}
                    onChange={(e) => setMatUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition"
                    placeholder="Ej. metros, conos"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cantidad</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={matQuantity}
                    onChange={(e) => setMatQuantity(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Stock Mínimo</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={matMinStock}
                    onChange={(e) => setMatMinStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Costo Unitario</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={matCost}
                    onChange={(e) => setMatCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none font-mono focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowMaterialForm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-xs font-bold transition shadow-sm"
                >
                  {editingMaterial ? "Actualizar" : "Crear e Insertar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Finished Form MODAL */}
      {showProductForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in block">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <h3 className="font-bold font-display text-base">
                {editingProduct ? "Modificar Prenda Confeccionada" : "Registrar Nueva Prenda en Almacén"}
              </h3>
              <button 
                onClick={() => setShowProductForm(false)} 
                className="text-slate-400 hover:text-white font-bold px-2 rounded hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Completo de la Prenda</label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition"
                  placeholder="Ej. Jean Denim Clásico Sisa"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de Ropa</label>
                  <select
                    value={prodType}
                    onChange={(e) => setProdType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-500 transition"
                  >
                    <option value="Chaqueta">Chaqueta</option>
                    <option value="Camisa">Camisa</option>
                    <option value="Pantalón">Pantalón</option>
                    <option value="Zapatos">Zapatos</option>
                    <option value="Saco">Saco</option>
                    <option value="Vestido">Vestido</option>
                    <option value="Remera/Polo">Remera/Polo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Talla</label>
                  <select
                    value={prodSize}
                    onChange={(e) => setProdSize(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-500 transition font-mono"
                  >
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Color</label>
                  <input
                    type="text"
                    required
                    value={prodColor}
                    onChange={(e) => setProdColor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition"
                    placeholder="Ej. Indigo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stock</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={prodStock}
                    onChange={(e) => setProdStock(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PVP Venta</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mat. Unit</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={prodMaterialCost}
                    onChange={(e) => setProdMaterialCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mano Obra</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={prodLaborCost}
                    onChange={(e) => setProdLaborCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 text-xs text-slate-600">
                <span className="font-bold text-slate-800 block mb-1">Trazabilidad Financiera:</span>
                <div className="flex justify-between">
                  <span>Costo total variable por prenda:</span>
                  <span className="font-mono font-bold text-slate-800">${(prodMaterialCost + prodLaborCost).toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span>Margen de contribución unitario:</span>
                  <span className="font-mono font-bold text-emerald-600">${(prodPrice - (prodMaterialCost + prodLaborCost)).toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowProductForm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-xs font-bold transition shadow-sm"
                >
                  {editingProduct ? "Guardar Cambios" : "Guardar Prenda"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
