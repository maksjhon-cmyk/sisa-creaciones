import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Client, UserProfile } from "../types";
import {
  Users, Search, UserPlus, Trash2, Edit2, Check, X, ShieldAlert, 
  MapPin, Phone, Mail, FileText, AlertTriangle, Printer, Info
} from "lucide-react";

interface ClientManagementProps {
  user: UserProfile;
}

export default function ClientManagement({ user }: ClientManagementProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [idTypeFilter, setIdTypeFilter] = useState<string>("todos");

  // Form states (Used for both Create and Edit)
  const [isEditing, setIsEditing] = useState(false);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [idType, setIdType] = useState<"cédula" | "ruc" | "pasaporte">("cédula");
  const [idNumber, setIdNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Real-time synchronization of clients
  useEffect(() => {
    setLoading(true);
    const qClients = query(collection(db, "clients"));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      const items: Client[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.name) {
          items.push(data as Client);
        }
      });
      // Sort alphabetically by name
      items.sort((a, b) => a.name.localeCompare(b.name));
      setClients(items);
      setLoading(false);
    }, (error) => {
      console.error("Error loading clients in master:", error);
      handleFirestoreError(error, OperationType.LIST, "clients");
      setLoading(false);
    });

    return () => unsubClients();
  }, []);

  // Validation rules for Ecuador identification document
  const validateEcuadorianID = (type: "cédula" | "ruc" | "pasaporte", idNum: string): boolean => {
    const cleanNum = idNum.trim();
    
    if (type === "pasaporte") {
      // Pasaporte validation: alphanumeric, between 5 and 20 characters
      return cleanNum.length >= 5 && cleanNum.length <= 20 && /^[a-zA-Z0-9]+$/.test(cleanNum);
    }
    
    if (type === "cédula") {
      if (cleanNum.length !== 10) return false;
      if (!/^\d+$/.test(cleanNum)) return false;
      
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
      
      // Verify natural/juridical person mod 10 or 11
      const CI_part = cleanNum.substring(0, 10);
      return validateEcuadorianID("cédula", CI_part) || cleanNum.startsWith("179") || cleanNum.startsWith("099");
    }
    
    return false;
  };

  const handleResetForm = () => {
    setName("");
    setIdType("cédula");
    setIdNumber("");
    setEmail("");
    setPhone("");
    setAddress("");
    setValidationError(null);
    setIsEditing(false);
    setEditClientId(null);
  };

  // Create or Update submit action
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSuccessMessage(null);

    const cleanName = name.trim().toUpperCase();
    const cleanIdNumber = idNumber.trim();
    const cleanEmail = email.trim();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();

    // 1. Mandatory Fields Validation
    if (!cleanName) {
      setValidationError("El nombre o razón social es obligatorio.");
      return;
    }
    if (!cleanIdNumber) {
      setValidationError("El número de identificación es obligatorio.");
      return;
    }
    if (!cleanAddress) {
      setValidationError("La dirección comercial o domiciliaria es obligatoria.");
      return;
    }
    if (!cleanPhone) {
      setValidationError("El teléfono de contacto es obligatorio.");
      return;
    }
    if (!cleanEmail) {
      setValidationError("El correo electrónico es obligatorio para facturación.");
      return;
    }

    // Email Pattern check
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(cleanEmail)) {
      setValidationError("Por favor, ingresa un correo electrónico válido.");
      return;
    }

    // 2. Ecuador SRI Identification Validation
    if (!validateEcuadorianID(idType, cleanIdNumber)) {
      if (idType === "cédula") {
        setValidationError("La cédula ecuatoriana es inválida (debe tener 10 dígitos y cumplir el algoritmo de verificación mod 10).");
      } else if (idType === "ruc") {
        setValidationError("El RUC ingresado es inválido (debe tener 13 dígitos, terminar en 001 y estar bien estructurado).");
      } else {
        setValidationError("El pasaporte es inválido (debe tener entre 5 y 20 caracteres alfanuméricos).");
      }
      return;
    }

    // 3. Database Write
    const targetId = isEditing && editClientId ? editClientId : `${idType}_${cleanIdNumber}`;
    const targetClient: Client = {
      id: targetId,
      name: cleanName,
      idType,
      idNumber: cleanIdNumber,
      email: cleanEmail,
      phone: cleanPhone,
      address: cleanAddress,
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "clients", targetId), targetClient);
      setSuccessMessage(
        isEditing
          ? `¡Cliente "${cleanName}" actualizado exitosamente!`
          : `¡Cliente "${cleanName}" registrado exitosamente en el sistema ERP!`
      );
      handleResetForm();
      
      // Auto dismiss success toast message after 4.5 seconds
      setTimeout(() => setSuccessMessage(null), 4500);
    } catch (error) {
      console.error("Error writing client:", error);
      setValidationError("Error al persistir la información del cliente en la base de datos.");
      handleFirestoreError(error, OperationType.WRITE, `clients/${targetId}`);
    }
  };

  const handleEditInit = (client: Client) => {
    setValidationError(null);
    setSuccessMessage(null);
    setIsEditing(true);
    setEditClientId(client.id);
    setName(client.name);
    setIdType(client.idType as any);
    setIdNumber(client.idNumber);
    setEmail(client.email);
    setPhone(client.phone);
    setAddress(client.address);
  };

  const handleDeleteClient = async (client: Client) => {
    const isConfirmed = window.confirm(
      `¿Está seguro de que desea eliminar permanentemente al cliente "${client.name}" del ERP?\nEsta acción es irreversible y podría afectar reportes históricos.`
    );
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, "clients", client.id));
      setSuccessMessage(`El cliente "${client.name}" ha sido eliminado exitosamente.`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (error) {
      console.error("Error deleting client:", error);
      handleFirestoreError(error, OperationType.DELETE, `clients/${client.id}`);
    }
  };

  // Filters application
  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.idNumber.includes(searchQuery) ||
      client.phone.includes(searchQuery);
    
    const matchesIdType = idTypeFilter === "todos" || client.idType === idTypeFilter;
    return matchesSearch && matchesIdType;
  });

  return (
    <div className="space-y-6 animate-fade-in" id="client-management-master-module">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="w-8 h-8 text-indigo-600 shrink-0" />
            <span>Gestión Maestra de Clientes</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registro unificado y oficial de clientes autorizados para Sisa Creaciones. Normativa tributaria de Ecuador.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-600">
          <Info className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>Único módulo del ERP autorizado para la creación y edición de clientes.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: CRUD FORM (CREATE & EDIT PANEL) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm h-fit">
          <div className="flex items-center gap-2 pb-4 mb-4 border-b border-slate-50">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              {isEditing ? "Modificar Ficha Cliente" : "Registrar Nuevo Cliente"}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Input Name */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                Nombres Completos / Razón Social <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: MARÍA AGUSTINA DE LA SISA"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-medium tracking-wide"
              />
            </div>

            {/* Input ID Type */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                Tipo de Identificación <span className="text-rose-500">*</span>
              </label>
              <select
                value={idType}
                onChange={(e) => {
                  setIdType(e.target.value as any);
                  setValidationError(null);
                }}
                disabled={isEditing}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
              >
                <option value="cédula">Cédula de Identidad (10 dígitos)</option>
                <option value="ruc">RUC de Facturación (13 dígitos)</option>
                <option value="pasaporte">Pasaporte (Alfanumérico)</option>
              </select>
            </div>

            {/* Input ID Number */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                Número de Identificación <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                placeholder={
                  idType === "cédula"
                    ? "Ej: 1723456789"
                    : idType === "ruc"
                    ? "Ej: 1723456789001"
                    : "Ej: AZ987654"
                }
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\s/g, ""))}
                className="w-full bg-slate-50 disabled:bg-slate-150 border border-slate-200 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-850 font-mono font-bold"
              />
            </div>

            {/* Input Address */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                Dirección Comercial / Domiciliaria <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Av. Amazonas N24 y Patria, local 3"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
              />
            </div>

            {/* Input Phone */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                Teléfono de Contacto <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: 0998765432"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+-\s]/g, ""))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-medium font-mono"
              />
            </div>

            {/* Input Email */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                Correo Electrónico (Para envío XML/RIDE) <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="Ej: cliente@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
              />
            </div>

            {/* Toast validation notifications */}
            {validationError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-xl flex items-start gap-2.5 text-xs font-semibold leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3 rounded-xl flex items-start gap-2.5 text-xs font-semibold leading-relaxed">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Form actions */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="w-1/3 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>
              )}
              <button
                type="submit"
                className={`py-2 rounded-xl text-xs font-bold transition shadow-sm text-white flex items-center justify-center gap-1.5 ${
                  isEditing
                    ? "w-2/3 bg-indigo-600 hover:bg-indigo-700"
                    : "w-full bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isEditing ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                <span>{isEditing ? "Guardar Cambios" : "Guardar Cliente"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: SEARCH, FILTER & CUSTOMER DATABASE LIST */}
        <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Filter and search bar layout */}
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search text input */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar cliente por Nombre/Apellido, Cédula/RUC, Celular..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
                />
              </div>

              {/* Id Type category select */}
              <div className="w-full md:w-52">
                <select
                  value={idTypeFilter}
                  onChange={(e) => setIdTypeFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-slate-600 font-medium"
                >
                  <option value="todos">Todos los Documentos</option>
                  <option value="cédula">Solo Cédulas (Ecuador)</option>
                  <option value="ruc">Solo RUC</option>
                  <option value="pasaporte">Solo Pasaportes</option>
                  <option value="consumidor_final">Consumidor Final</option>
                </select>
              </div>
            </div>

            {/* Loading Indicator */}
            {loading ? (
              <div className="text-center py-24 text-slate-400 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin" />
                <span className="text-xs font-semibold">Cargando base de datos maestra...</span>
              </div>
            ) : filteredClients.length > 0 ? (
              
              /* Table Layout for Clients */
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-primary-50 text-slate-505 font-bold uppercase tracking-wider select-none text-[10px]">
                      <th className="p-3">Cliente / Razón Social</th>
                      <th className="p-3">Identificación</th>
                      <th className="p-3">Contacto</th>
                      <th className="p-3">Dirección Física</th>
                      <th className="p-3 text-center">Acciones ERP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {filteredClients.map((client) => {
                      const idColors =
                        client.idType === "ruc"
                          ? "bg-amber-100 text-amber-900 border-amber-200"
                          : client.idType === "cédula"
                          ? "bg-indigo-100 text-indigo-905 border-indigo-200"
                          : client.idType === "pasaporte"
                          ? "bg-indigo-800 text-white border-indigo-750"
                          : "bg-slate-100 text-slate-800 border-slate-200";

                      return (
                        <tr
                          key={client.id}
                          className={`hover:bg-slate-50/50 transition ${
                            editClientId === client.id ? "bg-indigo-55/40" : ""
                          }`}
                        >
                          {/* Name col */}
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs shrink-0 select-none ${
                                client.idType === "pasaporte" ? "bg-indigo-900 text-white" : "bg-slate-100 text-slate-750"
                              }`}>
                                {client.name.substring(0, 2)}
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-900 uppercase leading-snug tracking-wide">{client.name}</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">ID Interno: {client.id}</p>
                              </div>
                            </div>
                          </td>

                          {/* ID col */}
                          <td className="p-3">
                            <div className="space-y-1">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${idColors}`}>
                                {client.idType.toUpperCase()}
                              </span>
                              <p className="font-mono font-bold text-slate-800 block text-[11px] mt-1">{client.idNumber}</p>
                            </div>
                          </td>

                          {/* Email/Phone col */}
                          <td className="p-3">
                            <div className="space-y-1 font-medium">
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[150px]">{client.email}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{client.phone}</span>
                              </div>
                            </div>
                          </td>

                          {/* Address col */}
                          <td className="p-3 text-slate-500 max-w-[160px] font-medium leading-relaxed">
                            <div className="flex items-start gap-1 p-0.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{client.address}</span>
                            </div>
                          </td>

                          {/* CRUD Actions */}
                          <td className="p-3">
                            <div className="flex justify-center gap-1.5">
                              <button
                                onClick={() => handleEditInit(client)}
                                title="Editar ficha"
                                className="p-2 hover:bg-slate-100 text-slate-550 hover:text-indigo-650 rounded-lg transition"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              
                              {/* Keep "CONSUMIDOR FINAL" catalog item safe from deletion as requested/implicit */}
                              {client.idNumber !== "9999999999999" && (
                                <button
                                  onClick={() => handleDeleteClient(client)}
                                  title="Eliminar del ERP"
                                  className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-650 rounded-lg transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Empty Database */
              <div className="text-center py-28 text-slate-300 flex flex-col justify-center items-center gap-3">
                <Users className="w-16 h-16 stroke-1 text-slate-300" />
                <div>
                  <p className="text-sm font-bold text-slate-600">No se encontraron clientes registrados</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Ajusta los filtros de búsqueda o ingresa un nuevo cliente con la tarjeta de registro rápido a tu izquierda.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Counts */}
          {!loading && clients.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-slate-100 text-[11px] font-bold text-slate-450 uppercase tracking-widest flex justify-between select-none">
              <span>Total Registros: {clients.length} Clientes Activos</span>
              <span>Filtrados: {filteredClients.length}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
