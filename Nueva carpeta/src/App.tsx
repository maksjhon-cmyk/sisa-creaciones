import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile } from "./types";
import Auth from "./components/Auth";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Inventory from "./components/Inventory";
import ProductionOrders from "./components/ProductionOrders";
import SalesInvoicing from "./components/SalesInvoicing";
import ClientManagement from "./components/ClientManagement";
import Costs from "./components/Costs";
import Accounting from "./components/Accounting";
import AdminConsole from "./components/AdminConsole";
import SmartAttendance from "./components/SmartAttendance";
import { Scissors } from "lucide-react";

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth synchronization listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          // Attempt to retrieve user profile document from Firestore
          const docRef = doc(db, "users", firebaseUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            // Profile missing but logged in - fallback as standard operator
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "",
              name: firebaseUser.displayName || "Usuario Sisa",
              role: (firebaseUser.email === "maksjhon@gmail.com" || firebaseUser.uid === "Sisa-Creaciones-ERP") ? "admin" : "operator",
              createdAt: new Date().toISOString(),
            };
            setUserProfile(newProfile);
            try {
              await setDoc(doc(db, "users", firebaseUser.uid), newProfile);
            } catch (saveErr) {
              console.warn("Retrying profile save during bootstrap: ", saveErr);
            }
          }
        } catch (err) {
          console.error("Error fetching secure user profile: ", err);
          // Fallback in case firestore hasn't been written to
          const fallbackProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || "",
            name: firebaseUser.displayName || "Usuario Sisa",
            role: (firebaseUser.email === "maksjhon@gmail.com" || firebaseUser.uid === "Sisa-Creaciones-ERP") ? "admin" : "operator",
            createdAt: new Date().toISOString(),
          };
          setUserProfile(fallbackProfile);
          try {
            await setDoc(doc(db, "users", firebaseUser.uid), fallbackProfile);
          } catch (saveErr) {
            console.warn("Retrying profile save during fallback: ", saveErr);
          }
        }
      } else {
        // Only clear if not in a simulated demo session
        setUserProfile((prev) => {
          if (prev?.uid.startsWith("demo_")) {
            return prev; // Maintain demo profiles across fast loads for design review
          }
          return null;
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUserProfile(null);
    } catch (err) {
      console.error("Error signing out: ", err);
    } finally {
      // Clears both Google and Demo credentials
      setUserProfile(null);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white" id="main-skeleton-loader">
        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20 active-pulse">
          <Scissors className="w-9 h-9 text-emerald-400 rotate-45" />
        </div>
        <h2 className="text-xl font-bold font-display tracking-tight">Sisa Creaciones</h2>
        <p className="text-xs text-slate-400 mt-2">Inicializando sistemas de tejeduría y control...</p>
        <div className="w-48 bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full animate-pulse w-2/3" />
        </div>
      </div>
    );
  }

  // Not Authenticated view
  if (!userProfile) {
    return (
      <Auth 
        onAuthSuccess={(profile) => {
          setUserProfile(profile);
          setActiveTab("dashboard");
        }} 
      />
    );
  }

  // Unified Industrial Layout
  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden bg-slate-50 font-sans antialiased text-slate-900" id="app-workspace">
      {/* Sidebar navigation panel */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={userProfile} 
        onLogout={handleLogout} 
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main viewport columns wrapper */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="lg:hidden bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-5 py-4 shrink-0 z-30 shadow-sm" id="mobile-top-bar">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1 rounded-lg hover:bg-slate-800 text-emerald-400 focus:outline-none transition"
              aria-label="Abrir menú"
              id="hamburger-btn"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <Scissors className="w-5 h-5 text-emerald-400 rotate-45" />
              <h1 className="text-base font-bold font-display tracking-tight text-white">Sisa Creaciones</h1>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 bg-slate-800 border border-slate-700/50 rounded-full font-mono font-medium text-emerald-400 uppercase tracking-widest">
            {userProfile.role === "admin" ? "Admin" : "Op"}
          </span>
        </header>

        {/* Main central container */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 h-full" id="app-viewport-pane">
          {activeTab === "dashboard" && (
            <Dashboard user={userProfile} setActiveTab={setActiveTab} />
          )}
          {activeTab === "inventory" && (
            <Inventory user={userProfile} />
          )}
          {activeTab === "orders" && (
            <ProductionOrders user={userProfile} />
          )}
          {activeTab === "clients" && (
            <ClientManagement user={userProfile} />
          )}
          {activeTab === "sales" && (
            <SalesInvoicing user={userProfile} setActiveTab={setActiveTab} />
          )}
          {activeTab === "finances" && (
            <Costs user={userProfile} />
          )}
          {activeTab === "accounting" && (
            <Accounting user={userProfile} />
          )}
          {activeTab === "attendance" && (
            <SmartAttendance user={userProfile} />
          )}
          {activeTab === "admin_console" && (
            <AdminConsole user={userProfile} />
          )}
        </main>
      </div>
    </div>
  );
}
