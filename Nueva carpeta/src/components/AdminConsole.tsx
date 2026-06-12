import { useEffect, useState, FormEvent } from "react";
import { collection, onSnapshot, query, setDoc, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { UserProfile, UserRole, RawMaterial, FinishedProduct, FixedCost, ProductionOrder } from "../types";
import { 
  Users, Layers, TrendingUp, ShieldAlert, CheckCircle2, AlertTriangle, Play, Pause, CircleCheck,
  UserCheck, DollarSign, Package, ClipboardList, Plus, Trash2, Edit2, Sparkles, RefreshCw, Trophy, Target,
  MoreHorizontal
} from "lucide-react";

interface FilaEmpleadoProps {
  key?: any;
  u: UserProfile;
  stats: any;
  currentUserUid: string;
  isCurrentUserAdmin: boolean;
  onEdit: (u?: UserProfile) => void;
  handleForzarBajaPersonal: (idObtenido: string) => Promise<void> | void;
}

function FilaEmpleado({ u, stats, currentUserUid, isCurrentUserAdmin, onEdit, handleForzarBajaPersonal }: FilaEmpleadoProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const empleado = { ...u, id: u.uid, cedula: u.cedula || "" };

  const detailRoleStr = u.detailRole || (u.role === "admin" ? "Administrador" : "Operario Costurera");
  let roleBadgeClass = "bg-indigo-50 text-indigo-700 border border-indigo-100";
  if (detailRoleStr === "Administrador") {
    roleBadgeClass = "bg-rose-50 text-rose-700 border border-rose-100";
  } else if (detailRoleStr === "Operario Sastre") {
    roleBadgeClass = "bg-amber-50 text-amber-700 border border-amber-100";
  }

  const statusStr = u.status || "Activo";
  const statusBadgeClass = statusStr === "Activo"
    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
    : "bg-slate-150 text-slate-600 border border-slate-200";

  return (
    <tr className="hover:bg-slate-50/50 transition">
      <td className="px-5 py-4">
        <div>
          <p className="font-bold text-slate-900">{u.name}</p>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{u.email}</p>
          <p className="text-[9px] text-slate-400 mt-1">
            Registrado: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Indetectado"}
          </p>
        </div>
      </td>
      <td className="px-5 py-4 whitespace-nowrap font-mono text-slate-700">
        {u.cedula || "--"}
      </td>
      <td className="px-5 py-4 whitespace-nowrap text-slate-700 font-mono">
        {u.phone || "--"}
      </td>
      <td className="px-5 py-4 whitespace-nowrap">
        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${roleBadgeClass}`}>
          {detailRoleStr}
        </span>
      </td>
      <td className="px-5 py-4 text-center whitespace-nowrap">
        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${statusBadgeClass}`}>
          {statusStr}
        </span>
      </td>
      <td className="px-5 py-4 text-center font-mono font-bold text-slate-800">
        {stats.total > 0 ? (
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            {stats.inProgress} activas / {stats.total} total
          </span>
        ) : (
          <span className="text-slate-400 font-normal">Sin carga</span>
        )}
      </td>
      <td className="px-5 py-4 text-center">
        <span className="font-mono bg-emerald-50 text-emerald-700 rounded-lg px-2 py-1 font-bold">
          {stats.completed} listas
        </span>
      </td>
      <td className="px-5 py-4">
        <div className="max-w-[120px] mx-auto space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-slate-700">
            <span>Tasa:</span>
            <span className="font-mono">{stats.productivityRate}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                stats.productivityRate > 75 
                  ? "bg-emerald-500" 
                  : stats.productivityRate > 40 
                  ? "bg-amber-500" 
                  : "bg-rose-500"
              }`}
              style={{ width: `${stats.productivityRate}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-right whitespace-nowrap relative">
        {isCurrentUserAdmin ? (
          <div className="flex justify-end items-center gap-2 h-full relative">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(u);
              }}
              style={{ cursor: "pointer", opacity: 1 }}
              className="p-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
              title="Editar"
            >
              <Edit2 className="w-3 h-3" />
              <span>Editar</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleForzarBajaPersonal(empleado.id || empleado.uid || empleado.cedula);
              }}
              style={{ 
                backgroundColor: '#dc2626', 
                color: '#ffffff', 
                border: 'none', 
                padding: '6px 12px', 
                borderRadius: '4px', 
                cursor: 'pointer', 
                position: 'relative', 
                zIndex: 9999, 
                pointerEvents: 'all', 
                opacity: 1 
              }}
            >
              ELIMINAR
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400 italic">Sólo lectura</span>
        )}
      </td>
    </tr>
  );
}

interface AdminConsoleProps {
  user: UserProfile;
}

export default function AdminConsole({ user }: AdminConsoleProps) {
  // Navigation & Sub-tab state
  const [currentSubTab, setCurrentSubTab] = useState<"users" | "inventory" | "fn">("users");

  // Data states
  const [users, setUsers] = useState<UserProfile[]>([]);
  const setPersonal = setUsers;
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [products, setProducts] = useState<FinishedProduct[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for Operator Profiles
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [uEmail, setUEmail] = useState("");
  const [uName, setUName] = useState("");
  const [uRole, setURole] = useState<UserRole>("operator");
  const [uUid, setUUid] = useState("");
  
  // Mandatory extended fields requested by Sisa Creaciones
  const [uCedula, setUCedula] = useState("");
  const [uPhone, setUPhone] = useState("");
  const [uStatus, setUStatus] = useState<"Activo" | "Inactivo">("Activo");
  const [uDetailRole, setUDetailRole] = useState<"Administrador" | "Operario Sastre" | "Operario Costurera">("Operario Costurera");

  // Security role checker for AdminConsole
  const isCurrentUserAdmin = 
    user?.rol === "administrador" || 
    user?.role === "admin" || 
    user?.email === "maksjhon@gmail.com" ||
    user?.uid === "Sisa-Creaciones-ERP";

  // Load datasets in real-time
  useEffect(() => {
    setLoading(true);

    const qUsers = query(collection(db, "users"));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const items: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        // Fail-safe mapper for both Spanish/English attributes and missing identifiers
        const uidVal = data.uid || docSnap.id;
        const uProfile: UserProfile = {
          uid: uidVal,
          email: data.email || data.correo || "",
          name: data.name || data.nombreCompleto || "",
          role: data.role || (data.rol === "administrador" ? "admin" : "operator"),
          rol: data.rol || (data.role === "admin" ? "administrador" : "operario"),
          cedula: data.cedula || data.cedulaRuc || "",
          phone: data.phone || data.telefono || "",
          status: data.status || data.estado || "Activo",
          detailRole: data.detailRole || (data.role === "admin" ? "Administrador" : "Operario Costurera"),
          createdAt: data.createdAt || new Date().toISOString()
        };

        if (uProfile.uid === "demo_maria_toaquiza" || uProfile.email === "maria.toaquiza@sisa.com" || docSnap.id === "demo_maria_toaquiza") {
          // Silently trigger background database deletion if this stale data is fetched
          deleteDoc(doc(db, "users", docSnap.id)).catch(() => {});
          deleteDoc(doc(db, "empleados", docSnap.id)).catch(() => {});
        } else if (uProfile.status === "Eliminado") {
          // Filtrado lógico: Ocultar y omitir automáticamente operarios con estado 'Eliminado' de la consola activa
        } else {
          items.push(uProfile);
        }
      });
      setUsers(items);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore collection 'users' read error:", error);
    });

    const qMaterials = query(collection(db, "raw_materials"));
    const unsubMaterials = onSnapshot(qMaterials, (snapshot) => {
      const items: RawMaterial[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as RawMaterial);
      });
      setRawMaterials(items);
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "finished_products");
    });

    const qOrders = query(collection(db, "production_orders"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const items: ProductionOrder[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as ProductionOrder);
      });
      setOrders(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "production_orders");
    });

    const qCosts = query(collection(db, "fixed_costs"));
    const unsubCosts = onSnapshot(qCosts, (snapshot) => {
      const items: FixedCost[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as FixedCost);
      });
      setFixedCosts(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "fixed_costs");
    });

    return () => {
      unsubUsers();
      unsubMaterials();
      unsubProducts();
      unsubOrders();
      unsubCosts();
    };
  }, []);

  // Productivity Calculations per Operator
  const getOperatorStats = (opId: string) => {
    const opOrders = orders.filter(o => o.assignedOperatorId === opId);
    const total = opOrders.length;
    const completed = opOrders.filter(o => o.status === "Listo").length;
    const inProgress = total - completed;
    const productivityRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      productivityRate,
      orders: opOrders
    };
  };

  // Find the top operator (operator with highest completed orders)
  const getTopOperator = () => {
    const operators = users.filter(u => u.role === "operator");
    if (operators.length === 0) return null;

    let bestOpProfile: UserProfile | null = null;
    let maxCompleted = -1;

    operators.forEach(op => {
      const stats = getOperatorStats(op.uid);
      if (stats.completed > maxCompleted || (stats.completed === maxCompleted && stats.productivityRate > (bestOpProfile ? getOperatorStats(bestOpProfile.uid).productivityRate : 0))) {
        maxCompleted = stats.completed;
        bestOpProfile = op;
      }
    });

    return bestOpProfile ? { profile: bestOpProfile, completed: maxCompleted } : null;
  };

  const topOpData = getTopOperator();

  // Financial Calculations
  const totalFixedCosts = fixedCosts.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  
  // Accumulated Inventory Capital Raw Materials
  const rawMaterialsCapital = rawMaterials.reduce((acc, m) => acc + (m.quantity * m.costPerUnit), 0);
  
  // Potential Sales Value Finished Goods
  const finishedProductsSalesPotential = products.reduce((acc, p) => acc + (p.stock * p.salePrice), 0);
  const finishedProductsCostValuation = products.reduce((acc, p) => acc + (p.stock * (p.materialCostPerUnit + p.laborCostPerUnit)), 0);

  // User Administration Operations
  const handleOpenUserForm = (op?: UserProfile) => {
    if (op) {
      setEditingUser(op);
      setUUid(op.uid);
      setUName(op.name);
      setUEmail(op.email);
      setURole(op.role || "operator");
      setUCedula(op.cedula || "");
      setUPhone(op.phone || "");
      setUStatus(op.status || "Activo");
      setUDetailRole(op.detailRole || (op.role === "admin" ? "Administrador" : "Operario Costurera"));
    } else {
      setEditingUser(null);
      setUUid(`user_${Date.now()}`);
      setUName("");
      setUEmail("");
      setURole("operator");
      setUCedula("");
      setUPhone("");
      setUStatus("Activo");
      setUDetailRole("Operario Costurera");
    }
    setShowUserForm(true);
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!uName.trim()) return alert("Por favor, ingrese el nombre completo.");
    if (!uEmail.trim()) return alert("Por favor, ingrese un correo válido.");
    if (!uCedula.trim()) return alert("Por favor, ingrese un número de identificación válido (Cédula/RUC).");
    if (!uPhone.trim()) return alert("Por favor, ingrese un número de teléfono válido.");

    const mappedRole: UserRole = uDetailRole === "Administrador" ? "admin" : "operator";
    const mappedRol = uDetailRole === "Administrador" ? "administrador" : "operario";

    const payload: UserProfile = {
      uid: uUid,
      email: uEmail.trim(),
      name: uName.trim(),
      role: mappedRole,
      rol: mappedRol,
      cedula: uCedula.trim(),
      phone: uPhone.trim(),
      status: uStatus,
      detailRole: uDetailRole,
      createdAt: editingUser ? editingUser.createdAt : new Date().toISOString(),
      
      // Dual-language properties to satisfy strict schema validation rules
      nombreCompleto: uName.trim(),
      cedulaRuc: uCedula.trim(),
      telefono: uPhone.trim(),
      estado: uStatus
    };

    const previousUsers = [...users];

    // 1. OPTIMISTIC UPDATE: Update memory state to render instantly
    setUsers((prev) => {
      const index = prev.findIndex(u => u.uid === uUid);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = payload;
        return updated;
      } else {
        return [...prev, payload];
      }
    });

    // Close form immediately to provide consistent responsiveness
    setShowUserForm(false);
    setEditingUser(null);

    // 2. FIRESTORE PERSISTENCE
    try {
      await setDoc(doc(db, "users", uUid), payload);
      await setDoc(doc(db, "personal", uUid), payload).catch(() => {});
      await setDoc(doc(db, "empleados", uUid), payload).catch(() => {});
    } catch (err: any) {
      console.warn("Firestore Save failed, rolling back optimistic state", err);
      // Rollback the optimistic state update
      setUsers(previousUsers);
      const displayError = err?.message || String(err);
      alert(`Error de Conectividad (Sisa Creaciones): \nNo se pudo guardar la información en Firestore: [${displayError}].\n\nSe restableció el estado anterior con éxito.`);
    }
  };

  const handleForzarBajaPersonal = async (idObtenido: string) => {
    if (!idObtenido) return alert("No se detecta ID válido para este empleado.");
    if (idObtenido === user.uid) {
      alert("No puedes eliminar tu propio usuario actual de administración.");
      return;
    }
    if (window.confirm("¿Seguro que desea eliminar a este empleado del sistema de Sisa Creaciones?")) {
      const previousUsers = [...users];
      const targetUser = users.find(u => u.uid === idObtenido);

      // 1. OPTIMISTIC UPDATE: instanstaneously hide the user
      setUsers((prev) => prev.filter(u => u.uid !== idObtenido));

      // 2. LOGICAL DELETE REMOTE UPDATE
      try { 
        // Realizamos Baja Lógica mediante updateDoc cambiando el campo status a 'Eliminado'
        await updateDoc(doc(db, 'users', idObtenido), { status: 'Eliminado', estado: 'Eliminado' });
        await updateDoc(doc(db, 'empleados', idObtenido), { status: 'Eliminado', estado: 'Eliminado' }).catch(() => {});
        await updateDoc(doc(db, 'personal', idObtenido), { status: 'Eliminado', estado: 'Eliminado' }).catch(() => {});
      } catch(err: any) { 
        console.warn("Remote logic delete failed, falling back to physical delete draft or rolling back", err);
        try {
          await deleteDoc(doc(db, 'users', idObtenido));
          await deleteDoc(doc(db, 'empleados', idObtenido)).catch(() => {});
          await deleteDoc(doc(db, 'personal', idObtenido)).catch(() => {});
        } catch(fallbackErr: any) {
          console.error("Complete delete routine failed, rolling back optimistic delete", fallbackErr);
          // Restore the user in the memory list
          setUsers(previousUsers);
          const displayErr = fallbackErr?.message || String(fallbackErr);
          alert(`Error de Conectividad (Sisa Creaciones): \nNo se pudo procesar la baja del personal: [${displayErr}].`);
        }
      }
    }
  };

  const handleDeleteUser = async (targetUid: string) => {
    await handleForzarBajaPersonal(targetUid);
  };

  const handleForzarEliminacion = async (id: string) => {
    await handleForzarBajaPersonal(id);
  };

  const handleBorradoInmediato = async (id: string) => {
    await handleForzarBajaPersonal(id);
  };

  const forzarBaja = async (id: string) => {
    await handleForzarBajaPersonal(id);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-[60vh]" id="admin-console-loading">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-500">Cargando métricas de fiscalización de Sisa...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans pb-10" id="admin-console-view">
      
      {/* Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-4" id="admin-dashboard-banner">
        <div>
          <span className="bg-rose-550 bg-slate-900 text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 border border-emerald-500/15">
            <ShieldAlert className="w-3.5 h-3.5" /> Consola de Fiscalización Suprema
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-2">Consola de Administración</h1>
          <p className="text-xs text-slate-500 mt-1">
            Supervisa en tiempo real la productividad de confección, valora inventarios y analiza el punto de equilibrio.
          </p>
        </div>

        {/* Console Nav buttons */}
        <div className="flex p-1 bg-slate-100 rounded-xl max-w-md shrink-0" id="admin-sub-navigation">
          <button
            onClick={() => setCurrentSubTab("users")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition duration-150 ${
              currentSubTab === "users"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className="w-4 h-4 text-emerald-605" />
            <span>Usuarios y Costura</span>
          </button>
          <button
            onClick={() => setCurrentSubTab("inventory")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition duration-150 ${
              currentSubTab === "inventory"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="w-4 h-4 text-violet-605" />
            <span>Auditoría de Stock</span>
          </button>
          <button
            onClick={() => setCurrentSubTab("fn")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition duration-150 ${
              currentSubTab === "fn"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-amber-605" />
            <span>Consolidado Financiero</span>
          </button>
        </div>
      </div>

      {/* SUB-SECTION 1: USERS AND SEWING PRODUCTIVITY */}
      {currentSubTab === "users" && (
        <div className="space-y-6" id="admin-users-tab">
          
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Operator counters */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gente del Taller</span>
                  <h3 className="text-3xl font-bold text-slate-950 mt-1 font-mono">
                    {users.length}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1.5 font-bold">
                    {users.filter(u => u.role === "admin").length} Admins • {users.filter(u => u.role === "operator").length} Operarios
                  </p>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600">
                  <Users className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Total workload */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carga de Trabajo</span>
                  <h3 className="text-3xl font-bold text-slate-950 mt-1 font-mono">
                    {orders.filter(o => o.status !== "Listo").length}
                  </h3>
                  <p className="text-[11px] text-rose-500 mt-1.5 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Órdenes activas en confección
                  </p>
                </div>
                <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                  <ClipboardList className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Best Performer */}
            <div className="bg-gradient-to-br from-emerald-950 to-slate-900 text-white p-5 rounded-2xl border border-emerald-800/10 shadow-sm relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-15 translate-x-3 translate-y-3">
                <Trophy className="w-24 h-24 text-emerald-400 rotate-12" />
              </div>
              <div className="flex justify-between items-start relative z-10">
                <div>
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Operaria Estrella ✨</span>
                  {topOpData ? (
                    <>
                      <h4 className="text-base font-bold text-white mt-1 uppercase tracking-tight line-clamp-1">
                        {topOpData.profile.name}
                      </h4>
                      <p className="text-[11px] text-emerald-300 mt-1.5 font-mono">
                        {topOpData.completed} órdenes marcadas como <span className="font-bold underline text-emerald-200">Listo</span>
                      </p>
                    </>
                  ) : (
                    <>
                      <h4 className="text-sm font-semibold text-slate-300 mt-1">Sin operarios registrados</h4>
                      <p className="text-[10px] text-slate-450 mt-1">Agrega personal de costura abajo</p>
                    </>
                  )}
                </div>
                <div className="bg-emerald-500/20 p-2 text-amber-400 rounded-xl">
                  <Trophy className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          {/* User management list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">Directorio del Personal y Productividad</h3>
                <p className="text-xs text-slate-500 mt-0.5">Controla roles de forma 100% real-time en Firestore con permisos de seguridad.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isCurrentUserAdmin ? (
                  <button
                    onClick={() => handleOpenUserForm()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl transition text-xs flex items-center gap-1.5 shadow cursor-pointer"
                    id="add-operator-btn"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar Trabajador</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl uppercase tracking-wider">
                    Solo Lectura (Sisa)
                  </span>
                )}
              </div>
            </div>

            {/* Form Drawer / Modal Inline */}
            {showUserForm && (
              <div className="p-6 bg-slate-50 rounded-2xl m-4 border border-slate-200" id="user-creation-form">
                <h4 className="text-xs font-bold text-slate-800 uppercase mb-4 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  {editingUser ? `Editar Perfil de: ${editingUser.name}` : "Registrar Nuevo Operario / Administrador"}
                </h4>
                <form onSubmit={handleSaveUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Nombres Completos *</label>
                      <input
                        type="text"
                        required
                        value={uName}
                        onChange={(e) => setUName(e.target.value)}
                        placeholder="Ej. Gladys Confecciones"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Número de Identificación (Cédula/RUC) *</label>
                      <input
                        type="text"
                        required
                        value={uCedula}
                        onChange={(e) => setUCedula(e.target.value)}
                        placeholder="Ej. 1712345678"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition text-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Teléfono *</label>
                      <input
                        type="text"
                        required
                        value={uPhone}
                        onChange={(e) => setUPhone(e.target.value)}
                        placeholder="Ej. 0987654321"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition text-slate-800 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Rol Detallado *</label>
                      <select
                        value={uDetailRole}
                        onChange={(e) => setUDetailRole(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition font-bold text-slate-800 cursor-pointer"
                      >
                        <option value="Administrador">Administrador</option>
                        <option value="Operario Sastre">Operario Sastre</option>
                        <option value="Operario Costurera">Operario Costurera</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Estado de Actividad *</label>
                      <select
                        value={uStatus}
                        onChange={(e) => setUStatus(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition font-bold text-slate-800 cursor-pointer"
                      >
                        <option value="Activo">Activo</option>
                        <option value="Inactivo">Inactivo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Correo Electrónico (Login / Acceso) *</label>
                      <input
                        type="email"
                        required
                        value={uEmail}
                        onChange={(e) => setUEmail(e.target.value)}
                        placeholder="ejemplo@sisa.com"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition font-mono text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-2 border-t border-slate-200/60 font-sans">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserForm(false);
                        setEditingUser(null);
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="bg-slate-900 hover:bg-emerald-600 text-white font-bold py-2 px-5 rounded-xl text-xs transition shadow-sm cursor-pointer"
                    >
                      {editingUser ? "Actualizar Personal" : "Guardar Personal en Firestore"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" id="admin-users-table">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Nombre / Identidad</th>
                    <th className="px-5 py-3 font-sans">Identificación (Cédula/RUC)</th>
                    <th className="px-5 py-3 font-sans">Teléfono</th>
                    <th className="px-5 py-3 font-sans">Rol Detallado</th>
                    <th className="px-5 py-3 text-center">Estado</th>
                    <th className="px-5 py-3 text-center">Carga Confección</th>
                    <th className="px-5 py-3 text-center">Rendimiento (Listo)</th>
                    <th className="px-5 py-3 text-center">Tasa Eficiencia</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {users.map((u) => {
                    const stats = getOperatorStats(u.uid);
                    return (
                      <FilaEmpleado 
                        key={u.uid}
                        u={u}
                        stats={stats}
                        currentUserUid={user.uid}
                        isCurrentUserAdmin={isCurrentUserAdmin}
                        onEdit={handleOpenUserForm}
                        handleForzarBajaPersonal={handleForzarBajaPersonal}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {users.length === 0 && (
              <div className="text-center p-8 text-slate-400">
                No hay usuarios registrados en el sistema de Sisa Creaciones.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-SECTION 2: STOCK AUDITING */}
      {currentSubTab === "inventory" && (
        <div className="space-y-6" id="admin-inventory-tab">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Raw materials audit list */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-600" /> Materia Prima (Telas y Avíos)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-1">Inspección de insumos textiles resguardados.</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Valorizado Material</p>
                  <p className="text-sm font-bold text-slate-900 font-mono">${rawMaterialsCapital.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50/20">
                      <th className="px-4 py-2.5">Material</th>
                      <th className="px-4 py-2.5">Categoría</th>
                      <th className="px-4 py-2.5 text-center">Disponible</th>
                      <th className="px-4 py-2.5 text-right">Costo unitario</th>
                      <th className="px-4 py-2.5 text-right">Capital Material</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rawMaterials.map((m) => {
                      const isLowStock = m.quantity < m.minStock;
                      return (
                        <tr key={m.id} className={`hover:bg-slate-50/40 transition ${isLowStock ? "bg-amber-50/30" : ""}`}>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-bold text-slate-900 flex items-center gap-1">
                                {m.name}
                                {isLowStock && (
                                  <span className="bg-red-100 text-red-700 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Bajo
                                  </span>
                                )}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600">{m.category}</span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-800">
                            {m.quantity} {m.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-600">
                            ${m.costPerUnit.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                            ${(m.quantity * m.costPerUnit).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                    {rawMaterials.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-slate-400">Sin materiales registrados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Finished products cost-benefit audit list */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Prendas Terminadas
                  </h3>
                  <p className="text-[10px] text-slate-550 text-slate-500 mt-1">Monitorea valor de venta y márgenes de utilidad por unidad.</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-450 uppercase font-bold text-slate-400">Venta Estimada</p>
                  <p className="text-sm font-bold text-emerald-700 font-mono">${finishedProductsSalesPotential.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50/20">
                      <th className="px-4 py-2.5">Prenda</th>
                      <th className="px-4 py-2.5 text-center">Talla/Color</th>
                      <th className="px-4 py-2.5 text-center">Unidades</th>
                      <th className="px-4 py-2.5 text-right">PVP Unitario</th>
                      <th className="px-4 py-2.5 text-right">Margen Bruto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {products.map((p) => {
                      const totalUnitCost = (p.materialCostPerUnit || 0) + (p.laborCostPerUnit || 0);
                      const unitProfit = p.salePrice - totalUnitCost;
                      const profitMarginPct = p.salePrice > 0 ? Math.round((unitProfit / p.salePrice) * 100) : 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/40 transition">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-bold text-slate-900">{p.name}</p>
                              <p className="text-[9px] text-slate-400 mt-0.5">{p.type}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap text-slate-650">
                            {p.size} {p.color ? `• ${p.color}` : ""}
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-800">
                            {p.stock} pzas
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-600">
                            ${p.salePrice.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                            <span className="font-bold text-emerald-600 block">${unitProfit.toFixed(2)}</span>
                            <span className="text-[9px] text-emerald-500 font-bold bg-emerald-50 px-1 py-0.5 rounded font-sans">{profitMarginPct}% util.</span>
                          </td>
                        </tr>
                      );
                    })}
                    {products.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-slate-400">Sin prendas terminadas registradas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* SUB-SECTION 3: CONSOLIDATED FINANCIALS & CORPORATE BREAK-EVEN */}
      {currentSubTab === "fn" && (
        <div className="space-y-6" id="admin-financials-tab">
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-3">
              <div className="p-3 rounded-lg bg-red-50 text-red-600 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Costo Fijo Mensual</p>
                <p className="text-xl font-bold text-slate-900 font-mono">${totalFixedCosts.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-3">
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Activo Material</p>
                <p className="text-xl font-bold text-slate-900 font-mono">${rawMaterialsCapital.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-3">
              <div className="p-3 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Costo Producto en Stock</p>
                <p className="text-xl font-bold text-slate-900 font-mono">${finishedProductsCostValuation.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-3">
              <div className="p-3 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patrimonio en Ventas</p>
                <p className="text-xl font-bold text-slate-900 font-mono">${finishedProductsSalesPotential.toLocaleString()}</p>
              </div>
            </div>

          </div>

          {/* Detailed Analytical Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase">Análisis Financiero Integrado de Punto de Equilibrio</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cálculos exactos sobre costos operativos vs margen de contribución. Conoce el volumen de ventas necesario para asegurar la rentabilidad.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Cost structure */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                  <h4 className="text-xs font-bold text-slate-800 uppercase mb-3 flex items-center gap-1.5">
                    <CircleCheck className="w-4 h-4 text-slate-600" />
                    Gastos Fijos Desglosados
                  </h4>
                  {fixedCosts.length === 0 ? (
                    <p className="text-xs text-slate-400">No hay costos fijos mensuales registrados. Registra conceptos como alquiler o sueldos en la pestaña "Costos y Punto de Eq.".</p>
                  ) : (
                    <div className="space-y-2">
                      {fixedCosts.map(fc => (
                        <div key={fc.id} className="flex justify-between items-center text-xs py-1 border-b border-dashed border-slate-200">
                          <span className="font-medium text-slate-600">{fc.concept}</span>
                          <span className="font-mono font-bold text-slate-950">${fc.amount.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-xs pt-2 font-bold text-slate-900 border-t border-slate-200">
                        <span>Total Gasto de Operación:</span>
                        <span className="font-mono text-rose-600">${totalFixedCosts.toFixed(2)} / mes</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/60 text-xs">
                  <h4 className="text-xs font-bold text-blue-900 mb-1 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5" /> Concepto del Punto de Equilibrio
                  </h4>
                  <p className="text-blue-700 leading-relaxed">
                    El punto de equilibrio determina cuántas prendas deben venderse al mes para cubrir exactamente el costo fijo operacional.
                    Se calcula mediante la fórmula: 
                    <span className="block font-mono font-bold text-center my-2 bg-white/60 p-1.5 rounded text-blue-900">
                      Unidades = Costo Fijo / Margen Contribución
                    </span>
                    Donde el Margen es el Precio de Venta menos todos los Costos Variables (Materia prima + Mano de obra de costura).
                  </p>
                </div>
              </div>

              {/* Center & Right Column: Grid calculations for all products */}
              <div className="lg:col-span-2 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-600" />
                  Cálculo de Viabilidad de Ventas por Tipo de Prenda
                </h4>
                
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-100">
                        <th className="px-4 py-3">Prenda Fabricada</th>
                        <th className="px-4 py-3 text-right">PVP</th>
                        <th className="px-4 py-3 text-right">Costo Variable</th>
                        <th className="px-4 py-3 text-right">Margen Neto</th>
                        <th className="px-4 py-3 text-center bg-emerald-50/45 text-emerald-800">Unidades de Equilibrio</th>
                        <th className="px-4 py-3 text-right">Ingreso de Sostenibilidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {products.map(p => {
                        const vCost = (p.materialCostPerUnit || 0) + (p.laborCostPerUnit || 0);
                        const margin = p.salePrice - vCost;
                        
                        let unitsNeeded = 0;
                        if (margin > 0) {
                          unitsNeeded = Math.ceil(totalFixedCosts / margin);
                        }

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/40 transition">
                            <td className="px-4 py-3 font-sans font-bold text-slate-900">
                              {p.name}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              ${p.salePrice.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              ${vCost.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-indigo-600">
                              ${margin.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center font-bold bg-emerald-50/15 text-emerald-700">
                              {margin > 0 ? (
                                <span className="p-1 px-2.5 bg-emerald-50 rounded-lg text-emerald-800 text-[11px] font-bold border border-emerald-100">
                                  {unitsNeeded} pzas
                                </span>
                              ) : (
                                <span className="text-rose-500 text-[10px]">P VP insuficiente</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-950">
                              {margin > 0 ? (
                                `$${(unitsNeeded * p.salePrice).toLocaleString(undefined, {maximumFractionDigits:0})}`
                              ) : (
                                "Incalculable"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {products.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center p-8 text-slate-400 font-sans">No hay prendas dadas de alta en el sistema para calcular viabilidad.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/55 text-xs text-slate-605 text-slate-600 leading-relaxed font-sans space-y-1">
                  <p className="font-bold text-slate-800">📌 Nota Administrativa de Sisa Creaciones:</p>
                  <p>
                    Las anteriores proyecciones calculan las unidades requeridas asumiendo que un solo tipo de producto absorbe el total de los costos fijos por completo de manera exclusiva.
                    Le recomendamos diversificar la producción textil en el taller para modular estos márgenes corporativos.
                  </p>
                </div>
              </div>

            </div>
          </div>
          
        </div>
      )}

    </div>
  );
}
