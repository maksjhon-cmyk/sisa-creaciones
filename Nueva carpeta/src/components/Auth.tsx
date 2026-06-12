import { useState, FormEvent } from "react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Scissors, ShieldCheck, User, Sparkles, Building2, Mail, Lock, UserPlus, KeyRound } from "lucide-react";
import { UserProfile, UserRole } from "../types";

interface AuthProps {
  onAuthSuccess: (profile: UserProfile | null) => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab & Custom Form states
  const [activeTab, setActiveTab] = useState<"email" | "demo">("email");
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("operator");

  // Email and Password Login/Register Flow
  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const emailTrim = email.trim();
    const nameTrim = fullName.trim();

    try {
      if (isRegistering) {
        if (!nameTrim) {
          throw new Error("Por favor, ingresa tu nombre completo para el perfil.");
        }
        if (password.length < 6) {
          throw new Error("La contraseña debe tener un mínimo de 6 caracteres.");
        }

        // 1. Create authentication user in Firebase Auth
        const result = await createUserWithEmailAndPassword(auth, emailTrim, password);
        const user = result.user;

        // 2. Set profile document in Firestore Users collection
        const userDocRef = doc(db, "users", user.uid);
        const finalRole: UserRole = emailTrim.toLowerCase() === "maksjhon@gmail.com" ? "admin" : selectedRole;

        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || emailTrim,
          name: nameTrim,
          role: finalRole,
          createdAt: new Date().toISOString(),
        };

        await setDoc(userDocRef, newProfile);
        onAuthSuccess(newProfile);
      } else {
        // 1. Sign in with Email / Password
        const result = await signInWithEmailAndPassword(auth, emailTrim, password);
        const user = result.user;

        // 2. Query profile info from Firestore database
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let profile: UserProfile;
        if (userDocSnap.exists()) {
          profile = userDocSnap.data() as UserProfile;
        } else {
          // Fallback if profile document does not yet exist
          const finalRole: UserRole = emailTrim.toLowerCase() === "maksjhon@gmail.com" ? "admin" : "operator";
          profile = {
            uid: user.uid,
            email: user.email || emailTrim,
            name: user.displayName || emailTrim.split("@")[0],
            role: finalRole,
            createdAt: new Date().toISOString(),
          };
          await setDoc(userDocRef, profile);
        }

        onAuthSuccess(profile);
      }
    } catch (err: any) {
      console.error("Firebase Authentication Error: ", err);
      let localizedError = "No se pudo completar la autenticación. Por favor, revisa tus datos.";
      
      if (err.code === "auth/email-already-in-use") {
        localizedError = "El correo electrónico ya se encuentra registrado por otro usuario.";
      } else if (err.code === "auth/weak-password") {
        localizedError = "La contraseña proporcionada es demasiado débil (mínimo 6 caracteres).";
      } else if (err.code === "auth/invalid-email") {
        localizedError = "El formato de correo electrónico ingresado no es válido.";
      } else if (
        err.code === "auth/user-not-found" || 
        err.code === "auth/wrong-password" || 
        err.code === "auth/invalid-credential"
      ) {
        localizedError = "Correo electrónico o contraseña incorrectos.";
      } else if (err.message) {
        localizedError = err.message;
      }

      setError(localizedError);
    } finally {
      setLoading(false);
    }
  };

  // Google Login flow (OAuth fallback)
  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) {
        throw new Error("No se pudo obtener información del usuario");
      }

      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      let profile: UserProfile;

      if (userDocSnap.exists()) {
        profile = userDocSnap.data() as UserProfile;
      } else {
        const finalRole: UserRole = user.email === "maksjhon@gmail.com" ? "admin" : "operator";
        
        const newProfile = {
          uid: user.uid,
          email: user.email || "",
          name: user.displayName || "Usuario Sisa",
          role: finalRole,
          createdAt: new Date().toISOString(),
        };

        await setDoc(userDocRef, newProfile);
        profile = newProfile as any;
      }

      onAuthSuccess(profile);
    } catch (err: any) {
      console.error(err);
      setError(
        "Error de autenticación con Google. Asegúrate de que el proveedor de Google esté activo en Firebase Console o utiliza acceso por Correo/Demos."
      );
    } finally {
      setLoading(false);
    }
  };

  // Demo fast-testing profiles login
  const handleDemoLogin = async (role: UserRole, emailStr: string, nameStr: string, customUid?: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Authenticate with Firebase Auth using standard credentials in the background to establish valid request.auth in Firestore rules
      let firebaseUser;
      try {
        const res = await signInWithEmailAndPassword(auth, emailStr, "sisa1234");
        firebaseUser = res.user;
      } catch (signInErr: any) {
        if (
          signInErr.code === "auth/user-not-found" || 
          signInErr.code === "auth/invalid-credential" || 
          signInErr.code === "auth/user-disabled"
        ) {
          const res = await createUserWithEmailAndPassword(auth, emailStr, "sisa1234");
          firebaseUser = res.user;
        } else {
          throw signInErr;
        }
      }

      const finalUid = customUid || firebaseUser.uid;
      const userDocRef = doc(db, "users", finalUid);

      const profile: UserProfile = {
        uid: finalUid,
        email: emailStr,
        name: nameStr,
        role,
        createdAt: new Date().toISOString(),
      };

      await setDoc(userDocRef, profile, { merge: true });
      onAuthSuccess(profile);
    } catch (err: any) {
      console.error("Demo background auth failure, falling back to mock profile: ", err);
      // Fallback offline persistence if firebase auth is blocked or failed
      onAuthSuccess({
        uid: customUid || `demo_offline_${role}`,
        email: emailStr,
        name: nameStr,
        role,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden" id="login-container">
      {/* Immersive background logo watermark detail */}
      <div className="absolute -left-16 -top-16 opacity-[0.03] text-white pointer-events-none select-none">
        <svg viewBox="0 0 100 100" className="w-[450px] h-[450px]" fill="none" stroke="currentColor" strokeWidth="2.5">
          <defs>
            <path id="bg-watermark-petal" d="M 50,22 C 63,22 69,37 60,51 C 55,59 45,59 40,51 C 31,37 37,22 50,22 Z" />
          </defs>
          <g transform="rotate(15 50 50)">
            <use href="#bg-watermark-petal" transform="rotate(0 50 50)" />
            <use href="#bg-watermark-petal" transform="rotate(72 50 50)" />
            <use href="#bg-watermark-petal" transform="rotate(144 50 50)" />
            <use href="#bg-watermark-petal" transform="rotate(216 50 50)" />
            <use href="#bg-watermark-petal" transform="rotate(288 50 50)" />
          </g>
        </svg>
      </div>

      <div className="absolute -right-24 -bottom-24 opacity-[0.02] text-white pointer-events-none select-none">
        <svg viewBox="0 0 100 100" className="w-[500px] h-[500px]" fill="none" stroke="currentColor" strokeWidth="2.5">
          <defs>
            <path id="bg-watermark-petal-2" d="M 50,22 C 63,22 69,37 60,51 C 55,59 45,59 40,51 C 31,37 37,22 50,22 Z" />
          </defs>
          <g transform="rotate(45 50 50)">
            <use href="#bg-watermark-petal-2" transform="rotate(0 50 50)" />
            <use href="#bg-watermark-petal-2" transform="rotate(72 50 50)" />
            <use href="#bg-watermark-petal-2" transform="rotate(144 50 50)" />
            <use href="#bg-watermark-petal-2" transform="rotate(216 50 50)" />
            <use href="#bg-watermark-petal-2" transform="rotate(288 50 50)" />
          </g>
        </svg>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden relative z-10" id="login-card">
        
        {/* Header Hero Canvas */}
        <div className="bg-slate-950 px-6 py-10 text-center relative border-b border-slate-900" id="login-header">
          <div className="absolute top-3 right-3 flex items-center space-x-1 bg-slate-900 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-semibold border border-slate-800">
            <Building2 className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>ERP Textil v1.2</span>
          </div>
          
          <div className="flex flex-col items-center select-none animate-[fadeIn_0.8s_ease-out]" id="sisa-logo-group">
            <svg viewBox="0 0 100 100" className="w-24 h-24 text-white mb-2" fill="none" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <path id="sisa-petal" d="M 50,22 C 63,22 69,37 60,51 C 55,59 45,59 40,51 C 31,37 37,22 50,22 Z" />
              </defs>
              <g>
                <use href="#sisa-petal" transform="rotate(0 50 50)" />
                <use href="#sisa-petal" transform="rotate(72 50 50)" />
                <use href="#sisa-petal" transform="rotate(144 50 50)" />
                <use href="#sisa-petal" transform="rotate(216 50 50)" />
                <use href="#sisa-petal" transform="rotate(288 50 50)" />
              </g>
            </svg>
            
            <h1 className="font-serif text-3xl font-bold tracking-[0.22em] text-white pl-[0.22em]">SISA</h1>
            <p className="text-[10px] tracking-[0.45em] text-slate-400 font-bold uppercase mt-1.5 pl-[0.45em] font-sans">CREACIONES</p>
          </div>
          
          <p className="text-slate-500 text-xs mt-3 max-w-xs mx-auto">Gestión integral de producción y costos textiles</p>
        </div>

        {/* Tab Selection Segments */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-1" id="auth-tab-segment">
          <button
            onClick={() => {
              setActiveTab("email");
              setError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold rounded-xl transition duration-150 ${
              activeTab === "email" 
                ? "bg-white text-slate-900 shadow-sm border border-slate-100" 
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Correo y Contraseña
          </button>
          <button
            onClick={() => {
              setActiveTab("demo");
              setError(null);
            }}
            className={`flex-1 py-3 text-xs font-bold rounded-xl transition duration-150 ${
              activeTab === "demo" 
                ? "bg-white text-slate-900 shadow-sm border border-slate-100" 
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Perfiles Demo Rápido
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 text-red-700 text-xs p-3.5 rounded-xl border border-red-100 mb-5 font-medium leading-relaxed" id="login-error">
              {error}
            </div>
          )}

          {/* TAB 1: Firebase Email/Password Method */}
          {activeTab === "email" && (
            <form onSubmit={handleEmailAuth} className="space-y-4 font-sans">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  {isRegistering ? (
                    <>
                      <UserPlus className="w-4 h-4 text-emerald-600" />
                      <span>Crear Cuenta Nueva</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4 text-emerald-600" />
                      <span>Inicio de Sesión</span>
                    </>
                  )}
                </h3>
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Firebase ID Auth
                </span>
              </div>

              {isRegistering && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Nombre Completo
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ej. María Josefa Sisa"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sisa@ejemplo.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>
              </div>

              {isRegistering && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Rol Operativo en ERP
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:bg-white transition cursor-pointer font-bold"
                  >
                    <option value="operator">Operadora de Confección / Costura</option>
                    <option value="admin">Administrador / Gerente de Taller</option>
                  </select>
                  <p className="text-[10px] text-slate-450 mt-1.5 leading-tight text-slate-400">
                    *Nota: Las cuentas registradas con <span className="font-mono text-emerald-600 font-bold">maksjhon@gmail.com</span> se asignan automáticamente como Administrador supremo.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition duration-200 shadow-md text-xs tracking-wider uppercase mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : isRegistering ? (
                  "Crear Cuenta Sisa"
                ) : (
                  "Ingresar al Portal"
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setError(null);
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline transition"
                >
                  {isRegistering 
                    ? "¿Ya tienes cuenta? Inicia sesión aquí" 
                    : "¿No tienes una cuenta? Regístrate en el taller aquí"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Demo Fast-Testing Profiles */}
          {activeTab === "demo" && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-2 mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  Perfiles preestablecidos de demostración rápida:
                </p>
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              </div>

              {/* Admin Profile Custom UID */}
              <button
                onClick={() => handleDemoLogin("admin", "maksjhon@gmail.com", "Consola Suprema Sisa", "Sisa-Creaciones-ERP")}
                disabled={loading}
                className="w-full flex items-center justify-between p-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:opacity-95 rounded-xl border border-slate-750 transition duration-150 text-left shadow-lg"
                id="demo-admin-custom-uid-btn"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <ShieldCheck className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white line-clamp-1">Administración Suprema (UID)</h4>
                    <span className="text-[11px] text-slate-300">UID: <span className="font-mono text-emerald-400">Sisa-Creaciones-ERP</span></span>
                  </div>
                </div>
                <div className="bg-emerald-500 text-slate-900 text-[9px] font-black px-2 py-0.5 rounded uppercase shrink-0">
                  SUPREMO
                </div>
              </button>

              {/* Admin Profile */}
              <button
                onClick={() => handleDemoLogin("admin", "maksjhon@gmail.com", "Maks Jhon (Gerente)")}
                disabled={loading}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 hover:border-slate-300 transition duration-150 text-left"
                id="demo-admin-btn"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">Administrador / Gerente</h4>
                    <span className="text-xs text-slate-500">Acceso total a finanzas y almacén</span>
                  </div>
                </div>
                <div className="bg-emerald-500/10 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase shrink-0">
                  Gerente
                </div>
              </button>

              {/* Operator Profile Lucia */}
              <button
                onClick={() => handleDemoLogin("operator", "operaria_lucia@sisa.com", "Lucía Confecciones")}
                disabled={loading}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 hover:border-slate-300 transition duration-150 text-left"
                id="demo-operator-lucia-btn"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">Operadora: Lucía</h4>
                    <span className="text-xs text-slate-500">Solo ve sus órdenes asignadas</span>
                  </div>
                </div>
                <span className="text-indigo-600 text-xs font-semibold shrink-0">Costurera</span>
              </button>

              {/* Operator Profile Carlos */}
              <button
                onClick={() => handleDemoLogin("operator", "operario_carlos@sisa.com", "Carlos Cortador")}
                disabled={loading}
                className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 hover:border-slate-300 transition duration-150 text-left"
                id="demo-operator-carlos-btn"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 line-clamp-1">Operador: Carlos</h4>
                    <span className="text-xs text-slate-500">Solo ve sus órdenes asignadas</span>
                  </div>
                </div>
                <span className="text-indigo-600 text-xs font-semibold shrink-0">Cortador</span>
              </button>
            </div>
          )}

          {/* Social Sign-In Segment (Google Auth) */}
          <div className="flex items-center my-5">
            <div className="flex-1 border-t border-slate-200"></div>
            <span className="mx-3 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Otras Opciones</span>
            <div className="flex-1 border-t border-slate-200"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold py-2.5 px-4 border border-slate-200 hover:border-slate-300 rounded-xl transition duration-150 shadow-sm text-xs"
            id="google-login-btn"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.66-.35-1.36-.35-2.09z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continuar con Google</span>
          </button>

        </div>

        {/* Footer info text */}
        <div className="bg-slate-50 px-6 py-4 text-center border-t border-slate-100 text-[10px] text-slate-400">
          Sisa Creaciones garantiza la trazabilidad textil desde el hilo hasta la entrega.
        </div>
      </div>
    </div>
  );
}
