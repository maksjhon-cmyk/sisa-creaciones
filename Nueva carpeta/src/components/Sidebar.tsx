import { LayoutDashboard, Layers, ClipboardList, TrendingUp, LogOut, Scissors, User2, ShieldCheck, Receipt, Users, Landmark, Clock, X } from "lucide-react";
import { UserProfile } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: UserProfile;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, isOpen, onClose }: SidebarProps) {
  const isAdminAuthorized = 
    user.role === "admin" || 
    user.uid === "Sisa-Creaciones-ERP" || 
    user.email === "maksjhon@gmail.com";

  const menuItems = [
    {
      id: "dashboard",
      name: "Tablero Principal",
      icon: LayoutDashboard,
      description: "Métricas y alertas en tiempo real",
    },
    {
      id: "inventory",
      name: "Gestión de Inventario",
      icon: Layers,
      description: "Materia prima y prendas",
    },
    {
      id: "orders",
      name: "Órdenes de Producción",
      icon: ClipboardList,
      description: "Hoja de ruta y operarios",
    },
    {
      id: "attendance",
      name: "Asistencia Digital",
      icon: Clock,
      description: "Terminal de marcas y justificados",
    },
    {
      id: "clients",
      name: "Gestión de Clientes",
      icon: Users,
      description: "Registro oficial único de clientes",
    },
    {
      id: "sales",
      name: "Facturación Electrónica",
      icon: Receipt,
      description: "Punto de Venta y RIDE SRI",
    },
    {
      id: "finances",
      name: "Costos y Punto de Eq.",
      icon: TrendingUp,
      description: "Cálculo y rentabilidad",
    },
    {
      id: "accounting",
      name: "Contabilidad y Finanzas",
      icon: Landmark,
      description: "Libro Diario, compras, nómina y balances",
    },
  ];

  // Dynamically inject the Admin Console if authorized
  if (isAdminAuthorized) {
    menuItems.push({
      id: "admin_console",
      name: "Consola de Administración",
      icon: ShieldCheck,
      description: "Auditoría, productividad y fiscalización",
    });
  }

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 bg-slate-900 text-white flex flex-col justify-between border-r border-slate-800 shrink-0 h-screen z-50 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 w-72 lg:z-auto ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="sidebar"
      >
        <div className="flex flex-col flex-1 py-6 overflow-hidden">
          {/* Brand Header */}
          <div className="px-6 pb-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-emerald-500/20 active-pulse">
                <Scissors className="w-5 h-5 text-emerald-400 rotate-45" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight font-display text-white">Sisa Creaciones</h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Taller Textil ERP</p>
              </div>
            </div>
            {/* Close button for mobile drawers */}
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Card */}
          <div className="px-4 py-4 mx-2 my-4 bg-slate-800/50 rounded-xl border border-slate-800/70 shrink-0" id="user-context-card">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-700/80 flex items-center justify-center border border-slate-600">
                <User2 className="w-5 h-5 text-slate-300" />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span
                className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide inline-block ${
                  user.role === "admin"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                }`}
              >
                {user.role === "admin" ? "Administrador" : "Operario"}
              </span>
              <span className="text-[9px] text-emerald-400/80 font-mono">Conectado</span>
            </div>
          </div>

          {/* Menu Items */}
          <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto" id="sidebar-navigator">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onClose(); // Close drawer on selection
                  }}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition duration-150 text-left group ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-300 border-l-4 border-emerald-500 font-semibold"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                  }`}
                  id={`sidebar-tab-${item.id}`}
                >
                  <Icon
                    className={`w-5 h-5 transition duration-150 group-hover:scale-105 ${
                      isActive ? "text-emerald-400" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-sans leading-none">{item.name}</p>
                    <p className="text-[10px] text-slate-500 mt-1 truncate group-hover:text-slate-400 font-sans">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Logout Action */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800/40 hover:bg-red-950/20 text-slate-400 hover:text-red-400 rounded-xl border border-slate-800 hover:border-red-900/30 transition duration-150 text-sm font-medium"
            id="logout-btn"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
