import { useEffect, useState, FormEvent } from "react";
import { collection, onSnapshot, query, setDoc, doc, deleteDoc, where, getDocs } from "firebase/firestore";
import { db, storage, handleFirestoreError, OperationType } from "../firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { ProductionOrder, UserProfile, OrderStatus } from "../types";
import { autoRegisterJournalEntry } from "../utils/accounting";
import { 
  ClipboardList, Plus, Trash2, Calendar, FileText, ArrowRight, CheckCircle2, User, HelpCircle, UserPlus, FileUp, Camera, Sparkles
} from "lucide-react";

interface ProductionOrdersProps {
  user: UserProfile;
}

export default function ProductionOrders({ user }: ProductionOrdersProps) {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [operators, setOperators] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [garmentType, setGarmentType] = useState("Blusa");
  const [patternUrl, setPatternUrl] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [quantity, setQuantity] = useState(50);
  const [size, setSize] = useState("M");
  const [color, setColor] = useState("");
  const [limitDate, setLimitDate] = useState("");
  const [assignedOperatorId, setAssignedOperatorId] = useState("");
  const [notes, setNotes] = useState("");

  // States for "Medidas y Detalles de la Prenda" (imagen image_31b425.png)
  const [modalidad, setModalidad] = useState<"Talla" | "Medidas">("Talla");
  const [tallaBlusa, setTallaBlusa] = useState<"S" | "M" | "L" | "XL" | "XXL" | "">("M");
  const [tallaAnaco, setTallaAnaco] = useState<string>("32");
  const [anchoEspalda, setAnchoEspalda] = useState<number | "">("");
  const [talleEspalda, setTalleEspalda] = useState<number | "">("");
  const [contornoBusto, setContornoBusto] = useState<number | "">("");
  const [contornoCintura, setContornoCintura] = useState<number | "">("");
  const [contornoCadera, setContornoCadera] = useState<number | "">("");
  const [largoManga, setLargoManga] = useState<number | "">("");
  const [largoTotalBlusa, setLargoTotalBlusa] = useState<number | "">("");
  const [puno, setPuno] = useState<number | "">("");
  const [pinza, setPinza] = useState<number | "">("");
  const [brazo, setBrazo] = useState<number | "">("");
  const [colorBlusa, setColorBlusa] = useState<string>("");
  const [anchoPollera, setAnchoPollera] = useState<number | string | "">("");
  const [faja, setFaja] = useState<number | string | "">("");
  const [dejaTela, setDejaTela] = useState<boolean>(false);
  const [dejaTelaBlusa, setDejaTelaBlusa] = useState<boolean>(false);
  const [dejaTelaPollera, setDejaTelaPollera] = useState<boolean>(false);
  const [dejaTelaFaja, setDejaTelaFaja] = useState<boolean>(false);

  // Cliente y Datos Financieros con cálculo de saldo balanceado y automático
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientIdNumber, setClientIdNumber] = useState("");
  const [clientIdType, setClientIdType] = useState("cédula"); // "cédula" | "ruc"
  const [clientAddress, setClientAddress] = useState("");
  const [valorPrenda, setValorPrenda] = useState<number | "">("");
  const [anticipo, setAnticipo] = useState<number | "">("");
  const [saldo, setSaldo] = useState<number | "">("");
  
  // Modal de control de excepción temporal para ingreso obligatorio de cédula/RUC
  const [showIdRequiredModal, setShowIdRequiredModal] = useState(false);
  const [pendingOcrData, setPendingOcrData] = useState<any>(null);

  useEffect(() => {
    const val = Number(valorPrenda) || 0;
    const ant = Number(anticipo) || 0;
    const computedSaldo = val - ant;
    setSaldo(computedSaldo > 0 ? computedSaldo : 0);
  }, [valorPrenda, anticipo]);

  // Storage Upload States
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  // AI OCR Scanning States
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrDragging, setOcrDragging] = useState(false);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState("");
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrBase64, setOcrBase64] = useState("");
  const [ocrMimeType, setOcrMimeType] = useState("");

  // Sub-vista de producción (Tablero Kanban de Control vs Lista Histórica)
  const [activeSubView, setActiveSubView] = useState<"kanban" | "list">("kanban");
  // Hoja de ruta y cronómetro de cuenta regresiva
  const [selectedRoadmapOrder, setSelectedRoadmapOrder] = useState<ProductionOrder | null>(null);
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    let interval: any;
    if (selectedRoadmapOrder) {
      interval = setInterval(() => {
        setTimeTick(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [selectedRoadmapOrder]);

  const statusList: OrderStatus[] = [
    "En Diseño",
    "Corte",
    "Confección/Costura",
    "Acabado/Planchado",
    "Control de Calidad",
    "Empaque",
    "Listo",
  ];

  const lowerType = (garmentType || "").toLowerCase();
  const normalizedPrenda = lowerType.includes("pollera") || lowerType.includes("anaco")
    ? "Pollera"
    : lowerType.includes("faja")
    ? "Faja"
    : "Blusa";

  // Listen to Production Orders & Operators
  useEffect(() => {
    setLoading(true);

    // Build query based strictly on the user role (Zero-Trust Security Client Formulation)
    let qOrders;
    if (user.role === "admin") {
      qOrders = query(collection(db, "production_orders"));
    } else {
      qOrders = query(
        collection(db, "production_orders"),
        where("assignedOperatorId", "==", user.uid)
      );
    }

    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const items: ProductionOrder[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data() as ProductionOrder);
      });
      // Sort orders by target limit date safely to avoid any crash
      items.sort((a, b) => {
        const dateA = a.limitDate || "";
        const dateB = b.limitDate || "";
        return dateA.localeCompare(dateB);
      });
      setOrders(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "production_orders");
    });

    // Admin lists all potential operators
    let unsubOperators = () => {};
    if (user.role === "admin") {
      const qOps = query(collection(db, "users"));
      unsubOperators = onSnapshot(qOps, (snapshot) => {
        const opsList: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          const profile = docSnap.data() as UserProfile;
          if (profile.role === "operator") {
            opsList.push(profile);
          }
        });
        setOperators(opsList);
      }, (error) => {
        // Operators themselves are locked from listing other users
        console.warn("Only administrators can query full user lists.", error);
      });
    }

    return () => {
      unsubOrders();
      unsubOperators();
    };
  }, [user]);

  const handleOpenOrderForm = (order?: ProductionOrder) => {
    setUploadPercent(null);
    setUploadError("");
    setLocalPreviewUrl("");
    if (order) {
      setEditingOrder(order);
      setOrderNumber(order.orderNumber);
      setGarmentType(order.garmentType);
      setPatternUrl((order as any).bocetoUrl || order.patternUrl || "");
      setQuantity(order.quantity);
      setSize(order.size);
      setColor(order.color);
      setLimitDate(order.limitDate);
      setAssignedOperatorId(order.assignedOperatorId);
      setNotes(order.notes);

      // Load custom measures/details if present
      if (order.medidasDetalles) {
        const md = order.medidasDetalles;
        setModalidad(md.modalidad || "Talla");
        setTallaBlusa(md.tallaBlusa || "M");
        setTallaAnaco(md.tallaAnaco || "32");
        setAnchoEspalda(md.anchoEspalda ?? "");
        setTalleEspalda(md.talleEspalda ?? "");
        setContornoBusto(md.contornoBusto ?? "");
        setContornoCintura(md.contornoCintura ?? "");
        setContornoCadera(md.contornoCadera ?? "");
        setLargoManga(md.largoManga ?? "");
        setLargoTotalBlusa(md.largoTotalBlusa ?? "");
        setPuno(md.puno ?? "");
        setPinza(md.pinza ?? "");
        setBrazo(md.brazo ?? "");
        setColorBlusa(md.colorBlusa || order.color || "");
        setAnchoPollera(md.anchoPollera ?? "");
        setFaja(md.faja ?? "");
        setDejaTela(md.dejaTela ?? false);
        setDejaTelaBlusa((md as any).dejaTelaBlusa ?? md.dejaTela ?? false);
        setDejaTelaPollera((md as any).dejaTelaPollera ?? md.dejaTela ?? false);
        setDejaTelaFaja((md as any).dejaTelaFaja ?? md.dejaTela ?? false);
      } else {
        setModalidad("Talla");
        setTallaBlusa("M");
        setTallaAnaco("32");
        setAnchoEspalda("");
        setTalleEspalda("");
        setContornoBusto("");
        setContornoCintura("");
        setContornoCadera("");
        setLargoManga("");
        setLargoTotalBlusa("");
        setPuno("");
        setPinza("");
        setBrazo("");
        setColorBlusa(order.color || "");
        setAnchoPollera("");
        setFaja("");
        setDejaTela(false);
        setDejaTelaBlusa(false);
        setDejaTelaPollera(false);
        setDejaTelaFaja(false);
      }
       setClientName(order.clientName || "");
      setClientPhone(order.clientPhone || "");
      setClientIdNumber(order.clientIdNumber || "");
      setClientIdType(order.clientIdType || "cédula");
      setClientAddress(order.clientAddress || "");
      setValorPrenda(order.valorPrenda || "");
      setAnticipo(order.anticipo || "");
      setSaldo(order.saldo || "");
    } else {
      setEditingOrder(null);
      setOrderNumber(`ORD-${Math.floor(1000 + Math.random() * 9000)}`);
      setGarmentType("Blusa");
      setPatternUrl("");
      setQuantity(1);
      setSize("M");
      setColor("");
      // Set limit date defaults to 2 weeks out
      const twoWeeks = new Date();
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      setLimitDate(twoWeeks.toISOString().split("T")[0]);
      // Grab first operator as default
      setAssignedOperatorId(operators[0]?.uid || "");
      setNotes("");

      setClientName("");
      setClientPhone("");
      setClientIdNumber("");
      setClientIdType("cédula");
      setClientAddress("");
      setValorPrenda("");
      setAnticipo("");
      setSaldo("");

      // Defaults for measures
      setModalidad("Talla");
      setTallaBlusa("M");
      setTallaAnaco("32");
      setAnchoEspalda("");
      setTalleEspalda("");
      setContornoBusto("");
      setContornoCintura("");
      setContornoCadera("");
      setLargoManga("");
      setLargoTotalBlusa("");
      setPuno("");
      setPinza("");
      setBrazo("");
      setColorBlusa("Azul Indigo");
      setAnchoPollera("");
      setFaja("");
      setDejaTela(false);
      setDejaTelaBlusa(false);
      setDejaTelaPollera(false);
      setDejaTelaFaja(false);
    }
    setShowOrderForm(true);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          resolve(dataUrl);
        };
        img.onerror = () => {
          resolve(event.target?.result as string); // fallback to original dataURL if img load fails
        };
      };
      reader.onerror = () => {
        resolve(""); // fallback to empty string on reader error
      };
    });
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Por favor, sube únicamente archivos de tipo imagen (.jpg, .png, .webp, etc.)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("El tamaño máximo permitido es de 5 MB.");
      return;
    }

    setUploadError("");
    setUploadPercent(0);

    // Instant local preview
    const localUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(localUrl);
    setPatternUrl(""); // reset until compressed base64 is ready

    // Compress the file and store it as a fallback in state immediately
    compressImage(file).then((base64) => {
      if (base64) {
        setPatternUrl((prev) => {
          // If we already have a remote URL uploaded successfully in the meantime, don't overwrite it
          if (prev.startsWith("http") && !prev.startsWith("blob:")) {
            return prev;
          }
          return base64;
        });
      }
    }).catch((err) => {
      console.error("Compression failed:", err);
    });

    const storagePath = `patterns/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadPercent(progress);
      },
      (error) => {
        console.warn("Storage upload error (using database fallback):", error);
        setUploadError(
          "Aviso: Falló la subida a Firebase Storage (" + error.message + 
          "). Como respaldo automático, optimizamos y guardaremos la imagen directamente en la base de datos."
        );
        setUploadPercent(null);
        setLocalPreviewUrl(""); // clear blob URL, let it render the compressed base64 patternUrl
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setPatternUrl(downloadUrl);
          setLocalPreviewUrl(""); // switch cleanly to remote storage URL
          setUploadPercent(null);
          setUploadError("");
        } catch (err: any) {
          console.warn("Error getting download URL (using database fallback):", err);
          setUploadError(
            "Aviso: La imagen se guardará directamente en la base de datos debido a un problema con la URL de almacenamiento."
          );
          setUploadPercent(null);
          setLocalPreviewUrl("");
        }
      }
    );
  };

  const handleOcrFileSelection = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setOcrError("Por favor, sube únicamente archivos de tipo imagen (.jpg, .png, .webp, etc.)");
      return;
    }
    
    setOcrError("");
    setOcrLoading(true);
    setOcrResult(null);

    // Revoke previous URL preview to avoid memory leaks
    if (ocrPreviewUrl) {
      URL.revokeObjectURL(ocrPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setOcrPreviewUrl(preview);

    try {
      // 1. Convert to compressed base64
      const base64Data = await compressImage(file);
      setOcrBase64(base64Data);
      setOcrMimeType(file.type);

      // 2. Perform the async server-side Gemini request
      const response = await fetch("/api/ocr/production-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: file.type,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("Datos extraídos exitosamente de la orden por la IA:", data);

      // 3. Robust Verification: Check if there's any sign of measurements or if it's completely blank.
      const hasAnyNumbers = [
        data.anchoEspalda, data.talleEspalda, data.contornoBusto, data.contornoCintura,
        data.contornoCadera, data.largoManga, data.largoTotalBlusa, data.puno,
        data.pinza, data.brazo, data.anchoPollera, data.faja
      ].some(val => Number(val) > 0);

      const hasTextDetails = (data.garmentType || "").trim().length > 0 || (data.color || "").trim().length > 0;

      if (!hasAnyNumbers && !hasTextDetails) {
        setOcrError("No se detectaron medidas claras, por favor llena los campos manualmente o intenta con otra foto");
        setOcrLoading(false);
        return;
      }

      setOcrResult(data);
    } catch (err: any) {
      console.error("Error durante el escaneo con IA:", err);
      setOcrError("No se detectaron medidas claras, por favor llena los campos manualmente o intenta con otra foto");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleApplyOcrResult = () => {
    if (!ocrResult) return;

    const extractedId = (ocrResult.clientIdNumber || "").trim();
    if (extractedId.length < 10) {
      // Excepción: Faltan datos de Identificación obligatorios (Cédula / RUC)
      setPendingOcrData(ocrResult);
      setShowIdRequiredModal(true);
      return;
    }

    applyOcrDataToForm(ocrResult);
  };

  const applyOcrDataToForm = (data: any) => {
    // PRIMERO - Identificación de Prenda y cambio automático de interfaz:
    let selectedGarment = "Blusa";
    if (data.anchoPollera > 0) {
      selectedGarment = "Pollera";
    } else if (data.faja > 0) {
      selectedGarment = "Faja";
    } else if (data.garmentType) {
      const lowerGate = data.garmentType.toLowerCase();
      if (lowerGate.includes("pollera") || lowerGate.includes("anaco")) {
        selectedGarment = "Pollera";
      } else if (lowerGate.includes("faja")) {
        selectedGarment = "Faja";
      } else {
        selectedGarment = "Blusa";
      }
    }
    setGarmentType(selectedGarment);

    if (data.color) setColor(data.color);
    if (data.notes) setNotes(data.notes);

    // Modalidad mapping
    if (data.modalidad) {
      setModalidad(data.modalidad === "Talla" ? "Talla" : "Medidas");
    }

    if (data.tallaBlusa) setTallaBlusa(data.tallaBlusa);
    if (data.tallaAnaco) setTallaAnaco(data.tallaAnaco);

    // SEGUNDO - Mapear e inyectar valores numéricos en los recuadros de medidas activos:
    setAnchoEspalda(data.anchoEspalda > 0 ? data.anchoEspalda : "");
    setTalleEspalda(data.talleEspalda > 0 ? data.talleEspalda : "");
    setContornoBusto(data.contornoBusto > 0 ? data.contornoBusto : "");
    setContornoCintura(data.contornoCintura > 0 ? data.contornoCintura : "");
    setContornoCadera(data.contornoCadera > 0 ? data.contornoCadera : "");
    setLargoManga(data.largoManga > 0 ? data.largoManga : "");
    setLargoTotalBlusa(data.largoTotalBlusa > 0 ? data.largoTotalBlusa : "");
    setPuno(data.puno > 0 ? data.puno : "");
    setPinza(data.pinza > 0 ? data.pinza : "");
    setBrazo(data.brazo > 0 ? data.brazo : "");
    if (data.colorBlusa) setColorBlusa(data.colorBlusa);
    setAnchoPollera(data.anchoPollera > 0 ? data.anchoPollera : "");
    setFaja(data.faja > 0 ? data.faja : "");

    // TERCERO - Extraer obligatoriamente los datos financieros y de contacto:
    if (data.clientName) setClientName(data.clientName);
    if (data.clientPhone) setClientPhone(data.clientPhone);
    if (data.clientIdNumber) setClientIdNumber(data.clientIdNumber);
    if (data.clientAddress) setClientAddress(data.clientAddress);
    if (data.valorPrenda > 0) setValorPrenda(data.valorPrenda);
    if (data.anticipo > 0) setAnticipo(data.anticipo);
    if (data.saldo > 0) setSaldo(data.saldo);

    // Deja tela mapping
    setDejaTelaBlusa(!!data.dejaTelaBlusa);
    setDejaTelaPollera(!!data.dejaTelaPollera);
    setDejaTelaFaja(!!data.dejaTelaFaja);

    // Use the scanned image as pattern URL as well
    if (ocrBase64) {
      setPatternUrl(ocrBase64);
    }

    // Reset and close OCR Modal
    setShowOcrModal(false);
    setOcrResult(null);
    setOcrPreviewUrl("");
    setOcrBase64("");
    setOcrMimeType("");
    setOcrError("");
  };

  const handleCloseOcr = () => {
    setShowOcrModal(false);
    setOcrResult(null);
    if (ocrPreviewUrl) {
      URL.revokeObjectURL(ocrPreviewUrl);
      setOcrPreviewUrl("");
    }
    setOcrBase64("");
    setOcrMimeType("");
    setOcrError("");
  };

  const handleSaveOrder = async (e: FormEvent) => {
    e.preventDefault();
    console.log("Guardando datos...", {
      orderNumber,
      garmentType,
      patternUrl,
      quantity,
      size,
      color,
      limitDate,
      assignedOperatorId,
      notes
    });

    if (user.role !== "admin") {
      console.warn("Acceso denegado: El usuario actual no es un administrador.");
      return;
    }

    try {
      // 1. Validaciones avanzadas de campos condicionales visibles en Sisa Creaciones
      if (modalidad === "Medidas") {
        if (normalizedPrenda === "Blusa") {
          const someFilled = [
            anchoEspalda, talleEspalda, contornoBusto, contornoCintura,
            contornoCadera, largoManga, largoTotalBlusa, puno, pinza, brazo
          ].some(val => val !== "" && Number(val) > 0);
          
          if (!someFilled) {
            alert("Atención: Por favor, introduce al menos una medida en centímetros para la Blusa.");
            return;
          }
        } else if (normalizedPrenda === "Pollera") {
          if (anchoPollera === "" || Number(anchoPollera) <= 0) {
            alert("Atención: Para la Pollera es obligatorio registrar un valor válido para el Ancho Pollera (AP) en centímetros (cm).");
            return;
          }
        } else if (normalizedPrenda === "Faja") {
          if (faja === "" || Number(faja) <= 0) {
            alert("Atención: Para la Faja es obligatorio registrar un valor válido de grosor/largo en centímetros (cm).");
            return;
          }
        }
      } else {
        // Modalidad = Talla
        if (normalizedPrenda === "Blusa" && !tallaBlusa) {
          alert("Por favor, selecciona una Talla de Blusa válida.");
          return;
        }
        if ((normalizedPrenda === "Pollera" || normalizedPrenda === "Faja") && !tallaAnaco) {
          alert("Por favor, selecciona una escala de confección para la prenda.");
          return;
        }
      }

      // 1b. Validaciones y fallbacks defensivos para evitar bloqueos
      const safeOrderNumber = orderNumber.trim() || `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      const safeGarmentType = garmentType.trim() || "Prenda de Vestir";
      const safeColor = color.trim() || "Sin especificar";
      const defaultLimitDate = limitDate || new Date().toISOString().split("T")[0];
      const safeQuantity = Number(quantity) > 0 ? Number(quantity) : 1;

      const id = editingOrder ? editingOrder.id : `order_${Date.now()}`;
      const targetOperator = operators.find((op) => op.uid === assignedOperatorId);
      const operatorName = targetOperator?.name || "Sin Asignar";

      // Usar placeholder de tela si no hay boceto cargado
      const finalBoceto = patternUrl || "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300&auto=format&fit=crop";

      // 1c. Client verification / de-duplication and automatic registry
      let associatedClientId = "";
      const cleanIdNumber = (clientIdNumber || "").trim();
      const cleanClientName = (clientName || "").trim();

      if (cleanIdNumber) {
        try {
          const clientQuery = query(collection(db, "clients"), where("idNumber", "==", cleanIdNumber));
          const clientSnap = await getDocs(clientQuery);

          if (!clientSnap.empty) {
            // Client exists! Use existing ID.
            const existingClientDoc = clientSnap.docs[0];
            associatedClientId = existingClientDoc.id;
            console.log("Cliente ya existe en el sistema oficial Sisa, vinculando orden al ID:", associatedClientId);
            
            // Update the client's information if they have new details
            const currentClientData = existingClientDoc.data();
            await setDoc(doc(db, "clients", associatedClientId), {
              ...currentClientData,
              name: cleanClientName || currentClientData.name,
              phone: (clientPhone || "").trim() || currentClientData.phone,
              address: (clientAddress || "").trim() || currentClientData.address,
              idType: clientIdType || currentClientData.idType || "cédula",
              updatedAt: new Date().toISOString()
            });
          } else {
            // Client doesn't exist. Create it automatically.
            associatedClientId = `client_${Date.now()}`;
            console.log("Registrando nuevo cliente en la colección 'clients':", cleanClientName);
            await setDoc(doc(db, "clients", associatedClientId), {
              id: associatedClientId,
              name: cleanClientName || "Cliente Autoregistrado",
              idType: clientIdType || "cédula",
              idNumber: cleanIdNumber,
              phone: (clientPhone || "").trim() || "--",
              address: (clientAddress || "").trim() || "Sin Dirección",
              email: "",
              updatedAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error("Error buscando/creando cliente en Firestore:", err);
        }
      }

      const payload: ProductionOrder = {
        id,
        orderNumber: safeOrderNumber,
        garmentType: safeGarmentType,
        patternUrl: finalBoceto,
        bocetoUrl: patternUrl || "", // Guarda la URL ingresada o cargada directamente
        quantity: safeQuantity,
        size: modalidad === "Talla" ? (normalizedPrenda === "Blusa" ? (tallaBlusa || "M") : (tallaAnaco || "32")) : "Medidas",
        color: colorBlusa.trim() || safeColor,
        limitDate: defaultLimitDate,
        assignedOperatorId: assignedOperatorId || "",
        assignedOperatorName: operatorName,
        status: editingOrder ? editingOrder.status : "En Diseño",
        notes: notes || "",
        createdAt: editingOrder ? editingOrder.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientName: cleanClientName,
        clientPhone: clientPhone.trim(),
        clientIdNumber: cleanIdNumber,
        clientIdType: clientIdType,
        clientAddress: clientAddress.trim(),
        valorPrenda: Number(valorPrenda) || 0,
        anticipo: Number(anticipo) || 0,
        saldo: Number(saldo) || 0,
        ...(associatedClientId ? { clientId: associatedClientId } as any : {}),
        medidasDetalles: {
          modalidad,
          tallaBlusa: modalidad === "Talla" && normalizedPrenda === "Blusa" ? tallaBlusa : "",
          tallaAnaco: modalidad === "Talla" && normalizedPrenda !== "Blusa" ? tallaAnaco : "",
          anchoEspalda: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(anchoEspalda) || 0) : 0,
          talleEspalda: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(talleEspalda) || 0) : 0,
          contornoBusto: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(contornoBusto) || 0) : 0,
          contornoCintura: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(contornoCintura) || 0) : 0,
          contornoCadera: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(contornoCadera) || 0) : 0,
          largoManga: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(largoManga) || 0) : 0,
          largoTotalBlusa: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(largoTotalBlusa) || 0) : 0,
          puno: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(puno) || 0) : 0,
          pinza: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(pinza) || 0) : 0,
          brazo: modalidad === "Medidas" && normalizedPrenda === "Blusa" ? (Number(brazo) || 0) : 0,
          colorBlusa: modalidad === "Medidas" ? colorBlusa : (color || safeColor),
          anchoPollera: modalidad === "Medidas" && normalizedPrenda === "Pollera" ? (Number(anchoPollera) || 0) : 0,
          faja: modalidad === "Medidas" && normalizedPrenda === "Faja" ? (Number(faja) || 0) : 0,
          dejaTela: normalizedPrenda === "Blusa" ? !!dejaTelaBlusa : normalizedPrenda === "Pollera" ? !!dejaTelaPollera : !!dejaTelaFaja,
          dejaTelaBlusa: !!dejaTelaBlusa,
          dejaTelaPollera: !!dejaTelaPollera,
          dejaTelaFaja: !!dejaTelaFaja,
        }
      };

      if (editingOrder && (editingOrder as any).stockDiscounted) {
        (payload as any).stockDiscounted = true;
      }

      console.log("Enviando orden a la base de datos (Firestore)...", payload);

      // PASO 1: Guardar de forma persistente en Firestore
      await setDoc(doc(db, "production_orders", id), payload);
      console.log("Guardado exitoso en Firebase de la Orden de Producción.");

      // REGISTRO AUTOMÁTICO EN CUENTAS POR COBRAR (CXC)
      const numericSaldo = Number(saldo) || 0;
      if (numericSaldo > 0) {
        const cxcId = `cxc_${id}`;
        await setDoc(doc(db, "cxc", cxcId), {
          id: cxcId,
          clientName: clientName.trim() || "Cliente Genérico",
          clientPhone: clientPhone.trim() || "--",
          productionOrderId: id,
          orderNumber: safeOrderNumber,
          montoPendiente: numericSaldo,
          fechaOrigen: new Date().toISOString().split("T")[0],
          estado: "Vigente",
          createdAt: new Date().toISOString(),
        });
        console.log("CXC registrado correctamente.");
      }

      // ASENTAMIENTO SIMULTÁNEO EN EL LIBRO DIARIO DE CONTABILIDAD
      const numericValorPrenda = Number(valorPrenda) || 0;
      if (numericValorPrenda > 0) {
        try {
          const numericAnticipo = Number(anticipo) || 0;
          const concept = `Reg. Orden ${safeOrderNumber} - Anticipo y Derecho: ${clientName.trim() || "Cliente"}`;
          const lines = [
            { accountId: "1.1", debit: numericAnticipo, credit: 0 },
            { accountId: "1.4", debit: numericSaldo, credit: 0 },
            { accountId: "2.4", debit: 0, credit: numericValorPrenda }
          ].filter(l => l.debit > 0 || l.credit > 0);

          if (lines.length > 0) {
            await autoRegisterJournalEntry(concept, id, lines);
            console.log("Asiento contable automático registrado en Libro Diario.");
          }
        } catch (error) {
          console.error("No se pudo automatizar el asiento contable:", error);
        }
      }

      // EVALUACIÓN DE MATERIA PRIMA ESCALABLE (CXP / ALERTA DE STOCK)
      const dejaLaTela = normalizedPrenda === "Blusa" ? !!dejaTelaBlusa : normalizedPrenda === "Pollera" ? !!dejaTelaPollera : !!dejaTelaFaja;
      if (!dejaLaTela) {
        try {
          const notificationId = `notif_cxp_${id}_${Date.now()}`;
          await setDoc(doc(db, "inventario_notifications", notificationId), {
            id: notificationId,
            productionOrderId: id,
            orderNumber: safeOrderNumber,
            garmentType: safeGarmentType,
            message: `Evaluación de Materia Prima Requerida: El cliente NO deja tela para la orden ${safeOrderNumber}. Se debe evaluar stock para evitar desabastecimiento y estimar cuenta por pagar provisional a proveedores.`,
            status: "Pendiente",
            createdAt: new Date().toISOString()
          });
          console.log("Notificación para CXP y desabastecimiento de inventario generada.");
        } catch (e) {
          console.error("Error al registrar alerta de inventario de tela:", e);
        }
      }

      // PASO 2: Actualizar el estado local de la aplicación inmediatamente sin recargar la página
      setOrders((prev) => {
        const index = prev.findIndex((item) => item.id === id);
        const updated = [...prev];
        if (index > -1) {
          updated[index] = payload;
        } else {
          updated.push(payload);
        }
        return updated.sort((a, b) => {
          const dateA = a.limitDate || "";
          const dateB = b.limitDate || "";
          return dateA.localeCompare(dateB);
        });
      });

      // PASO 3: Cerrar y ocultar la ventana modal inmediatamente
      setShowOrderForm(false);
      setEditingOrder(null);
      
      // Limpiar estados locales inmediatamente (UX Clenaup de Sisa Creaciones)
      setOrderNumber("");
      setGarmentType("Blusa");
      setPatternUrl("");
      setLocalPreviewUrl("");
      setQuantity(1);
      setSize("M");
      setColor("");
      setNotes("");
      setLimitDate("");
      setAssignedOperatorId("");
      
      setClientName("");
      setClientPhone("");
      setClientIdNumber("");
      setClientIdType("cédula");
      setClientAddress("");
      setValorPrenda("");
      setAnticipo("");
      setSaldo("");

      // Medidas
      setModalidad("Talla");
      setTallaBlusa("M");
      setTallaAnaco("32");
      setAnchoEspalda("");
      setTalleEspalda("");
      setContornoBusto("");
      setContornoCintura("");
      setContornoCadera("");
      setLargoManga("");
      setLargoTotalBlusa("");
      setPuno("");
      setPinza("");
      setBrazo("");
      setColorBlusa("");
      setAnchoPollera("");
      setFaja("");
      setDejaTela(false);
      setDejaTelaBlusa(false);
      setDejaTelaPollera(false);
      setDejaTelaFaja(false);

      console.log("Modal de orden cerrado y estados blanqueados exitosamente.");
    } catch (err: any) {
      console.error("Error fatal rescatado al guardar la orden de producción:", err);
      alert("Error procesando los datos: " + (err.message || String(err)));
      handleFirestoreError(err, editingOrder ? OperationType.UPDATE : OperationType.CREATE, "production_orders");
    }
  };

  const handleUpdateStatus = async (order: ProductionOrder, nextStatus: OrderStatus) => {
    try {
      let updatedOrder: ProductionOrder = {
        ...order,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };

      // Automate Inventory deduction when moving out of "En Diseño" (approving instruction for production floor)
      const deductBlusa = (order.medidasDetalles?.dejaTelaBlusa ?? order.medidasDetalles?.dejaTela ?? false) === false;
      const deductPollera = (order.medidasDetalles?.dejaTelaPollera ?? order.medidasDetalles?.dejaTela ?? false) === false;
      const deductFaja = (order.medidasDetalles?.dejaTelaFaja ?? order.medidasDetalles?.dejaTela ?? false) === false;

      const alreadyDiscounted = (order as any).stockDiscounted === true;
      const approvedForProduction = nextStatus !== "En Diseño";

      if (!alreadyDiscounted && approvedForProduction) {
        let blusaFabricToDeduct = 0;
        let polleraFabricToDeduct = 0;
        let fajaFabricToDeduct = 0;

        if (order.medidasDetalles) {
          if (order.medidasDetalles.modalidad === "Medidas") {
            const largoBlusa = Number(order.medidasDetalles.largoTotalBlusa) || 0;
            const largoManga = Number(order.medidasDetalles.largoManga) || 0;
            const anchoPollera = Number(order.medidasDetalles.anchoPollera) || 0;
            const fajaVal = Number(order.medidasDetalles.faja) || 0;

            if (deductBlusa) {
              blusaFabricToDeduct = largoBlusa > 0 ? (largoBlusa + largoManga) / 100 : 1.5;
            }
            if (deductPollera) {
              polleraFabricToDeduct = anchoPollera > 0 ? (anchoPollera / 100) * 1.5 : 1.0;
            }
            if (deductFaja) {
              fajaFabricToDeduct = fajaVal > 0 ? (fajaVal / 100) * 0.5 : 0.3;
            }
          } else {
            // Tallas
            if (deductBlusa) {
              const sizeString = order.medidasDetalles.tallaBlusa || order.size || "M";
              if (sizeString === "XL" || sizeString === "XXL") {
                blusaFabricToDeduct = 1.8;
              } else {
                blusaFabricToDeduct = 1.5;
              }
            }

            if (deductPollera) {
              const ta = order.medidasDetalles.tallaAnaco;
              if (ta) {
                const taNum = Number(ta);
                if (taNum >= 36) {
                  polleraFabricToDeduct = 2.5;
                } else {
                  polleraFabricToDeduct = 2.0;
                }
              } else {
                polleraFabricToDeduct = 2.0;
              }
            }

            if (deductFaja) {
              const fajaVal = Number(order.medidasDetalles.faja) || 0;
              fajaFabricToDeduct = fajaVal > 0 ? (fajaVal / 100) * 0.5 : 0.3;
            }
          }
        } else {
          if (deductBlusa) blusaFabricToDeduct = 1.5;
          if (deductPollera) polleraFabricToDeduct = 2.0;
          if (deductFaja) fajaFabricToDeduct = 0.3;
        }

        const totalFabricToDeduct = (blusaFabricToDeduct + polleraFabricToDeduct + fajaFabricToDeduct) * order.quantity;

        if (totalFabricToDeduct > 0) {
          // Find raw material of category "Tela" or named containing "Tela"
          const qMaterials = query(collection(db, "raw_materials"));
          const matSnapshot = await getDocs(qMaterials);
          let fabricMaterialId: string | null = null;
          let fabricMaterialData: any = null;
          
          matSnapshot.forEach((docSnap) => {
            const mat = docSnap.data();
            if (!fabricMaterialId && (mat.category?.toLowerCase() === "tela" || mat.name?.toLowerCase().includes("tela"))) {
              fabricMaterialId = docSnap.id;
              fabricMaterialData = mat;
            }
          });
          
          // Fallback default fabric if none exists in their database yet
          if (!fabricMaterialId) {
            fabricMaterialId = "default_tela";
            fabricMaterialData = {
              id: "default_tela",
              name: "Tela Algodón Sisa Creaciones",
              category: "Tela",
              quantity: 500,
              unit: "metros",
              minStock: 20,
              costPerUnit: 4.5,
              updatedAt: new Date().toISOString()
            };
            await setDoc(doc(db, "raw_materials", "default_tela"), fabricMaterialData);
          }
          
          if (fabricMaterialId && fabricMaterialData) {
            const newQty = Math.max(0, (Number(fabricMaterialData.quantity) || 0) - totalFabricToDeduct);
            await setDoc(doc(db, "raw_materials", fabricMaterialId), {
              ...fabricMaterialData,
              quantity: newQty,
              updatedAt: new Date().toISOString()
            });
            
            const partsDeducted = [];
            if (deductBlusa) partsDeducted.push(`Blusa (${(blusaFabricToDeduct * order.quantity).toFixed(2)}m)`);
            if (deductPollera) partsDeducted.push(`Pollera (${(polleraFabricToDeduct * order.quantity).toFixed(2)}m)`);
            if (deductFaja) partsDeducted.push(`Faja (${(fajaFabricToDeduct * order.quantity).toFixed(2)}m)`);

            const partsFrozen = [];
            if (!deductBlusa) partsFrozen.push(`Blusa (deja cliente, $0 cons)`);
            if (!deductPollera) partsFrozen.push(`Pollera (deja cliente, $0 cons)`);
            if (!deductFaja) partsFrozen.push(`Faja (deja cliente, $0 cons)`);

            let logMsg = `\n[SISTEMA ERP] Descuentos textiles: Restados del inventario (${partsDeducted.join(", ")} - Total: ${totalFabricToDeduct.toFixed(2)}m de ${fabricMaterialData.name}).`;
            if (partsFrozen.length > 0) {
              logMsg += ` Protegido/congelado para: ${partsFrozen.join(", ")}.`;
            }

            (updatedOrder as any).stockDiscounted = true;
            updatedOrder.notes = `${updatedOrder.notes || ""}${logMsg}`.trim();
          }
        } else {
          // No fabric needs to be deducted at all (all parts are 'deja tela' or supplier-controlled)
          const logMsg = `\n[SISTEMA ERP] Sin descuentos textiles: tela de todos los componentes es suministrada por el cliente ($0 consumo total en materiales).`;
          
          (updatedOrder as any).stockDiscounted = true;
          updatedOrder.notes = `${updatedOrder.notes || ""}${logMsg}`.trim();
        }
      }

      await setDoc(doc(db, "production_orders", order.id), updatedOrder);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `production_orders/${order.id}`);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (user.role !== "admin") return;
    try {
      await deleteDoc(doc(db, "production_orders", id));
      if (deletingOrderId === id) {
        setDeletingOrderId(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "production_orders");
    }
  };

  // Helpers for Ticket and Roadmap
  const getElapsedString = (createdAt: string) => {
    if (!createdAt) return "Calculando...";
    const created = new Date(createdAt);
    if (isNaN(created.getTime())) return "N/A";
    const diffMs = Date.now() - created.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const days = Math.floor(hours / 24);
    if (days > 0) {
      return `Hace ${days}d, ${hours % 24}h ${mins}m`;
    }
    if (hours > 0) {
      return `Hace ${hours}h ${mins}m`;
    }
    return `Hace ${mins || 1}m`;
  };

  const getCountdownTimer = (limitDateStr: string) => {
    if (!limitDateStr) return "N/A";
    const limitDateTime = new Date(limitDateStr + "T23:59:59").getTime();
    const now = Date.now();
    const diffMs = limitDateTime - now;
    if (diffMs <= 0) {
      return "Plazo Expirado ⚠️";
    }
    const seconds = Math.floor((diffMs / 1000) % 65);
    const minutes = Math.floor((diffMs / (1000 * 65)) % 65);
    const hours = Math.floor((diffMs / (1000 * 65 * 65)) % 24);
    const days = Math.floor(diffMs / (1000 * 65 * 65 * 24));
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  return (
    <div className="space-y-6" id="production-orders-tab">
      {/* Header and Add Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-105 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-900">Hoja de Ruta Textil</h1>
          <p className="text-sm text-slate-500 mt-1">Seguimiento por fases de prendas de confección en taller.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggler Segmented Control */}
          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200/50" id="orders-view-toggle">
            <button
              type="button"
              onClick={() => setActiveSubView("kanban")}
              className={`py-1.5 px-3 uppercase tracking-wider text-[10px] font-black rounded-lg transition-all ${
                activeSubView === "kanban"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Control Kanban
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView("list")}
              className={`py-1.5 px-3 uppercase tracking-wider text-[10px] font-black rounded-lg transition-all ${
                activeSubView === "list"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Lista e Historial
            </button>
          </div>

          {user.role === "admin" && (
            <button
              type="button"
              onClick={() => handleOpenOrderForm()}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm"
              id="register-order-btn"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Orden</span>
            </button>
          )}
        </div>
      </div>

      {/* Orders List / Workspace cards */}
      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center max-w-lg mx-auto shadow-sm">
          <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No hay órdenes de producción asignadas</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {user.role === "admin"
              ? "Crea una nueva orden de trabajo texturizada para que las operarias puedan iniciar el corte y costura."
              : "Revisa más tarde. Tu supervisor no te ha asignado tareas en el taller por el momento."}
          </p>
        </div>
      ) : activeSubView === "kanban" ? (
        /* ============================================================== */
        /* TABLERO KANBAN DE CONTROL SISA                                 */
        /* ============================================================== */
        <div className="space-y-4" id="sisa-kanban-board">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
             <span>PASOS DE CONFECCIÓN EN CIRCUITO DE OPERARIOS</span>
             <span className="italic font-semibold text-indigo-700 animate-pulse">Haz clic en tarjetas para Hoja de Ruta y Tiempos ⏳</span>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 items-start select-none pt-1 scrollbar-thin scrollbar-thumb-slate-200">
            {statusList.map((colStatus, colIdx) => {
              const ordersInCol = orders.filter(o => o.status === colStatus);
              
              const colColors: Record<OrderStatus, { bg: string, text: string, border: string, dot: string }> = {
                "En Diseño": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-205", dot: "bg-slate-400" },
                "Corte": { bg: "bg-amber-50/70", text: "text-amber-850", border: "border-amber-200", dot: "bg-amber-505" },
                "Confección/Costura": { bg: "bg-emerald-50/70", text: "text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-500" },
                "Acabado/Planchado": { bg: "bg-blue-50/70", text: "text-blue-800", border: "border-blue-200", dot: "bg-blue-500" },
                "Control de Calidad": { bg: "bg-purple-50/70", text: "text-purple-800", border: "border-purple-200", dot: "bg-purple-500" },
                "Empaque": { bg: "bg-fuchsia-50/70", text: "text-fuchsia-800", border: "border-fuchsia-200", dot: "bg-fuchsia-500" },
                "Listo": { bg: "bg-teal-50", text: "text-teal-800", border: "border-teal-200", dot: "bg-teal-500" }
              };

              const style = colColors[colStatus] || colColors["En Diseño"];

              return (
                <div 
                  key={colStatus} 
                  className={`bg-slate-50 border border-slate-200 rounded-2xl p-4 w-80 shrink-0 flex flex-col space-y-3.5 min-h-[500px] shadow-sm`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-2.5 h-2.5 rounded-full ${style.dot} shrink-0`} />
                      <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider font-sans truncate" title={colStatus}>
                        {colStatus}
                      </h3>
                    </div>
                    <span className="bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full font-mono">
                      {ordersInCol.length}
                    </span>
                  </div>

                  {/* Column Cards stack */}
                  <div className="flex flex-col gap-3.5 overflow-y-auto max-h-[550px] pr-0.5 scrollbar-thin">
                    {ordersInCol.map((order) => {
                      const hasSaldo = Number(order.saldo) > 0;
                      return (
                        <div
                          key={order.id}
                          onClick={() => {
                            setSelectedRoadmapOrder(order);
                          }}
                          className={`bg-white hover:bg-slate-50/50 rounded-xl border border-slate-150 p-4 shadow-sm hover:shadow-md transition duration-200 cursor-pointer space-y-3.5 relative group`}
                        >
                          {/* Order Card Head */}
                          <div className="flex items-center justify-between">
                            <span className="bg-indigo-50 text-indigo-800 border border-indigo-150 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                              {order.orderNumber}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">
                              {order.limitDate}
                            </span>
                          </div>

                          {/* Garment details */}
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight">{order.garmentType}</h4>
                            <p className="text-[10px] text-slate-505 mt-1 font-semibold truncate flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{order.clientName || "Sin registrar"}</span>
                            </p>
                          </div>

                          {/* Prenda details */}
                          <div className="grid grid-cols-2 gap-2 text-[9px] pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-slate-400 font-bold block uppercase scale-90 origin-left">Cantidad</span>
                              <span className="font-mono text-slate-800 font-black">{order.quantity} u</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-bold block uppercase scale-90 origin-left">Talla / Color</span>
                              <span className="text-slate-800 font-bold truncate block">{order.size} / {order.color}</span>
                            </div>
                          </div>

                          {/* Badges for Materials & Sisa's alert rules */}
                          <div className="flex flex-wrap gap-1.5">
                            {hasSaldo && (
                              <span className="bg-rose-100 border border-rose-200 text-rose-800 text-[8px] font-black px-1.5 py-0.5 rounded font-sans uppercase tracking-wider animate-pulse flex items-center gap-1">
                                🚨 SALDO ${Number(order.saldo).toFixed(0)}
                              </span>
                            )}
                            
                            {((order.medidasDetalles as any)?.dejaTelaBlusa ?? order.medidasDetalles?.dejaTela ?? false) ? (
                              <span className="bg-amber-50 text-amber-900 border border-amber-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded font-sans">
                                Tela: Cliente
                              </span>
                            ) : (
                              <span className="bg-emerald-50 text-emerald-955 border border-emerald-200 text-[8px] font-extrabold px-1.5 py-0.5 rounded font-sans">
                                Tela: Sisa
                              </span>
                            )}
                          </div>

                          {/* Operator name indicators */}
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100/60">
                            <span className="truncate max-w-[120px] font-semibold text-slate-600 block">
                              Op: {order.assignedOperatorName || "Sin asignar"}
                            </span>
                          </div>

                          {/* Fast interactive buttons to push states */}
                          <div 
                            className="flex items-center justify-between border-t border-slate-100 pt-2 bg-slate-50/50 -mx-4 -mb-4 px-4 py-2.5 rounded-b-xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={colIdx === 0}
                              onClick={() => handleUpdateStatus(order, statusList[colIdx - 1])}
                              className="p-1 px-2 text-xs font-black text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition"
                              title="Mover al estado anterior"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenOrderForm(order)}
                              className="text-[10px] uppercase font-black text-indigo-600 hover:text-indigo-805 transition tracking-widest"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={colIdx === statusList.length - 1}
                              onClick={() => handleUpdateStatus(order, statusList[colIdx + 1])}
                              className="p-1 px-2 text-xs font-black text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition"
                              title="Avanzar de etapa"
                            >
                              →
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {ordersInCol.length === 0 && (
                      <div className="text-center py-16 text-slate-400 text-[10px] font-black uppercase tracking-wider border border-dashed border-slate-250 rounded-2xl bg-white/45">
                        Cola Vacía
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="orders-grid">
          {orders.map((o) => {
            const currentStatusIndex = statusList.indexOf(o.status);

            return (
              <div 
                key={o.id} 
                className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                id={`order-card-${o.id}`}
              >
                <div>
                  {/* Top order metrics */}
                  <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {o.orderNumber}
                        </span>
                        <h4 className="text-base font-bold text-slate-800">{o.garmentType}</h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Entrega límite: <strong>{o.limitDate}</strong></span>
                      </p>
                    </div>

                    {user.role === "admin" && (
                      <div className="flex gap-1 items-center">
                        {deletingOrderId === o.id ? (
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 px-2 py-1 rounded-xl shadow-sm animate-fade-in">
                            <span className="text-[10px] font-bold text-red-600 font-sans">¿Eliminar?</span>
                            <button
                              onClick={() => handleDeleteOrder(o.id)}
                              className="bg-red-650 hover:bg-red-700 text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md transition"
                            >
                              Sí
                            </button>
                            <button
                              onClick={() => setDeletingOrderId(null)}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md transition"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleOpenOrderForm(o)}
                              className="p-1 px-2.5 text-xs font-semibold hover:bg-slate-100 inline-block rounded text-slate-500"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setDeletingOrderId(o.id)}
                              className="p-1 text-red-500 hover:bg-red-50 text-xs font-semibold rounded"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Body description & visuals */}
                  <div className="flex gap-4 py-4">
                    <div 
                      onClick={() => setZoomedImageUrl(o.bocetoUrl || o.patternUrl)}
                      className="relative w-16 h-16 rounded-xl overflow-hidden cursor-zoom-in shrink-0 border border-slate-150 group"
                      title="Clic para ampliar boceto"
                    >
                      <img
                        src={o.bocetoUrl || o.patternUrl}
                        alt="Patrón de costura"
                        className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[8px] font-bold">
                        🔍 Ampliar
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600 flex-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block">Cantidad:</span>
                          <span className="font-bold text-slate-800">{o.quantity} unidades</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Especificación:</span>
                          <span className="font-bold text-slate-800">Talla {o.size} | {o.color}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Asignada a:</span>
                        <div className="flex items-center gap-1.5 mt-0.5 text-slate-800 font-semibold text-xs">
                          <User className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{o.assignedOperatorName || "Sin asignar"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Digital Job Ticket Details */}
                  {o.medidasDetalles && (
                    <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 mb-4 text-xs space-y-2 font-sans">
                      <div className="flex items-center justify-between border-b border-slate-200/50 pb-1.5">
                        <span className="font-bold text-indigo-700 uppercase text-[9px] tracking-wider flex items-center gap-1">
                          📐 Ficha de Medidas y Detalles (Taller)
                        </span>
                        <span className="bg-indigo-150 text-indigo-800 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                          Modalidad: {o.medidasDetalles.modalidad}
                        </span>
                      </div>
                      
                      {o.medidasDetalles.modalidad === "Talla" ? (
                        <div className="grid grid-cols-2 gap-2 text-slate-700">
                          <div className="bg-white p-2 rounded-lg border border-slate-100">
                            <span className="text-slate-400 text-[9px] uppercase font-bold block mb-0.5">Talla de Blusa:</span>
                            <span className="font-bold text-slate-800 text-xs">{o.medidasDetalles.tallaBlusa || "M"}</span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-100">
                            <span className="text-slate-400 text-[9px] uppercase font-bold block mb-0.5">Talla Anaco (TA):</span>
                            <span className="font-bold text-slate-800 text-xs">{o.medidasDetalles.tallaAnaco || "32"}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-700 bg-white p-2 border border-slate-100 rounded-lg">
                          {o.medidasDetalles.anchoEspalda ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">AE (Espalda):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.anchoEspalda} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.talleEspalda ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">TE (Talle):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.talleEspalda} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.contornoBusto ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">CB (Busto):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.contornoBusto} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.contornoCintura ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">CCin (Cintura):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.contornoCintura} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.contornoCadera ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">CK (Cadera):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.contornoCadera} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.largoManga ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">LM (Manga):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.largoManga} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.largoTotalBlusa ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">LB (Largo):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.largoTotalBlusa} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.puno ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">Puño:</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.puno} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.pinza ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">Pinza:</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.pinza} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.brazo ? (
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">Brazo:</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.brazo} cm</span>
                            </div>
                          ) : null}
                          {o.medidasDetalles.colorBlusa ? (
                            <div className="col-span-2">
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">Color Blusa:</span>
                              <span className="font-bold text-slate-800">{o.medidasDetalles.colorBlusa}</span>
                            </div>
                          ) : null}
                        </div>
                      )}
                      
                      {/* Pollera e Faja / Inventario automatic details */}
                      {(o.medidasDetalles.anchoPollera || o.medidasDetalles.faja || o.medidasDetalles.dejaTela !== undefined || (o.medidasDetalles as any).dejaTelaBlusa !== undefined) && (
                        <div className="border-t border-slate-200/50 pt-2 bg-white/50 p-2.5 rounded-lg space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-700">
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">AP (Pollera):</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.anchoPollera ? `${o.medidasDetalles.anchoPollera} cm` : "—"}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[8px] block uppercase font-medium">Faja:</span>
                              <span className="font-bold font-mono text-slate-800">{o.medidasDetalles.faja ? `${o.medidasDetalles.faja} cm` : "—"}</span>
                            </div>
                          </div>
                          
                          {/* Origen de Telas / Control Cortadores */}
                          <div className="border-t border-slate-100 pt-1.5 space-y-1">
                            <span className="text-[8px] uppercase font-bold text-slate-400 block tracking-wider">Origen de Materiales (Ficha Taller):</span>
                            <div className="grid grid-cols-3 gap-1">
                              {/* Tela Blusa */}
                              <div className="flex flex-col items-center p-1 rounded bg-slate-50 border border-slate-200/30 text-[9px]">
                                <span className="text-slate-400 text-[7px] font-bold block scale-90 mb-0.5 whitespace-nowrap">TELA BLUSA</span>
                                {((o.medidasDetalles as any).dejaTelaBlusa ?? o.medidasDetalles.dejaTela ?? false) ? (
                                  <span className="text-amber-800 bg-amber-50 font-black px-1 py-0.5 rounded text-[8px] uppercase whitespace-nowrap">
                                    CLIENTE
                                  </span>
                                ) : (
                                  <span className="text-emerald-800 bg-emerald-50 font-black px-1 py-0.5 rounded text-[8px] uppercase whitespace-nowrap">
                                    TALLER
                                  </span>
                                )}
                              </div>

                              {/* Tela Pollera */}
                              <div className="flex flex-col items-center p-1 rounded bg-slate-50 border border-slate-200/30 text-[9px]">
                                <span className="text-slate-400 text-[7px] font-bold block scale-90 mb-0.5 whitespace-nowrap">TELA POLLERA</span>
                                {((o.medidasDetalles as any).dejaTelaPollera ?? o.medidasDetalles.dejaTela ?? false) ? (
                                  <span className="text-amber-800 bg-amber-50 font-black px-1 py-0.5 rounded text-[8px] uppercase whitespace-nowrap">
                                    CLIENTE
                                  </span>
                                ) : (
                                  <span className="text-emerald-800 bg-emerald-50 font-black px-1 py-0.5 rounded text-[8px] uppercase whitespace-nowrap">
                                    TALLER
                                  </span>
                                )}
                              </div>

                              {/* Tela Faja */}
                              <div className="flex flex-col items-center p-1 rounded bg-slate-50 border border-slate-200/30 text-[9px]">
                                <span className="text-slate-400 text-[7px] font-bold block scale-90 mb-0.5 whitespace-nowrap font-sans">TELA FAJA</span>
                                {((o.medidasDetalles as any).dejaTelaFaja ?? o.medidasDetalles.dejaTela ?? false) ? (
                                  <span className="text-amber-800 bg-amber-50 font-black px-1 py-0.5 rounded text-[8px] uppercase whitespace-nowrap">
                                    CLIENTE
                                  </span>
                                ) : (
                                  <span className="text-emerald-800 bg-emerald-50 font-black px-1 py-0.5 rounded text-[8px] uppercase whitespace-nowrap">
                                    TALLER
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Operational comments notes */}
                  {o.notes && (
                    <div className="bg-slate-50 text-[11px] text-slate-500/90 rounded-lg p-2.5 border border-slate-100 mb-4 italic">
                      <strong className="text-[10px] uppercase font-bold text-slate-400 not-italic block mb-0.5">Ficha de Observaciones:</strong>
                      {o.notes}
                    </div>
                  )}

                  {/* Guía Visual Obligatoria de Bordados y Prendas (Pantalla de Taller) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block self-start mb-2">
                      Guía Visual de Prenda / Bordado / Patrón (Obligatorio en Taller):
                    </span>
                    {(() => {
                      const bocetoUrl = o.bocetoUrl || o.patternUrl || "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300&auto=format&fit=crop";
                      return (
                        <div className="flex flex-col items-center gap-2">
                          <img
                            src={bocetoUrl}
                            alt="Boceto"
                            onClick={() => setZoomedImageUrl(bocetoUrl)}
                            style={{ maxWidth: "200px", borderRadius: "8px" }}
                            className="cursor-pointer border border-slate-200 hover:ring-2 hover:ring-emerald-500 transition-all shadow-sm max-h-[150px] object-contain"
                            referrerPolicy="no-referrer"
                            title="Haz clic para ampliar boceto a pantalla completa"
                          />
                          <p className="text-[9px] text-slate-400 text-center font-medium">
                            🔍 Haz clic sobre la imagen para examinar los detalles a pantalla completa
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Alerta Visual Obligatoria de Saldo Pendiente de Sisa Creaciones */}
                  {Number(o.saldo) > 0 && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 mb-4 flex items-center justify-between text-xs font-sans shadow-sm" id={`billing-alert-o-${o.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                        <div>
                          <p className="font-bold text-rose-900 leading-none mb-0.5">SALDO PENDIENTE POR COBRAR</p>
                          <p className="text-[10px] text-rose-700 font-medium">Cliente: {o.clientName || "Sin registrar"} | Cel: {o.clientPhone || "—"}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold font-mono bg-rose-200/60 px-2.5 py-1 rounded-lg text-rose-900 block leading-tight">
                          ${Number(o.saldo).toFixed(2)}
                        </span>
                        <span className="text-[8px] uppercase tracking-wider font-extrabold text-rose-700 block mt-1">NO ENTREGAR PRENDA</span>
                      </div>
                    </div>
                  )}

                  {/* Steps Progress Visual roadmap */}
                  <div className="space-y-1.5 my-4">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Fase de Hoja de Ruta:</span>
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 border border-slate-100" id={`road-progress-bar-${o.id}`}>
                      {statusList.map((st, i) => {
                        const isDone = i <= currentStatusIndex;
                        const isCurrent = i === currentStatusIndex;
                        const barColor = isCurrent 
                          ? "bg-emerald-500" 
                          : isDone 
                            ? "bg-slate-900 border-r border-slate-800" 
                            : "bg-slate-200/50";
                        return (
                          <div 
                            key={st}
                            className={`flex-1 ${barColor} transition-colors duration-300`}
                            title={st}
                          ></div>
                        );
                      })}
                    </div>
                    {/* Status badge names */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-indigo-700">Diseño</span>
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <span className={`font-semibold ${o.status === "Confección/Costura" ? "text-emerald-600 font-bold active-pulse" : "text-slate-500"}`}>Costura</span>
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <span className={`font-semibold ${o.status === "Listo" ? "text-blue-600 font-bold" : "text-slate-400"}`}>Empaque/Listo</span>
                    </div>
                  </div>
                </div>

                {/* Status Switch Controls container */}
                <div className="border-t border-slate-100 pt-3 mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Estado Actual: <strong className="text-slate-800">{o.status}</strong>
                  </span>

                  {/* Dropdown status update for Assigned Operator or Admin (Tier 1 vs Tier 2 ABAC Action) */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-medium font-sans">Avanzar:</span>
                    <select
                      value={o.status}
                      onChange={(e) => handleUpdateStatus(o, e.target.value as OrderStatus)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs px-2.5 py-1.5 rounded-lg font-bold border-0 focus:outline-none transition self-start cursor-pointer"
                      id={`status-select-${o.id}`}
                    >
                      {statusList.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Forms Modals (Admins Only) */}
      {/* ------------------------------------------------------------- */}
      {showOrderForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in block">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <h3 className="font-bold font-display text-base">
                {editingOrder ? "Actualizar Parámetros de Orden" : "Lanzar Nueva Orden de Manufactura"}
              </h3>
              <button 
                onClick={() => setShowOrderForm(false)} 
                className="text-slate-400 hover:text-white font-bold px-2 rounded hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Banner de Escaneo con IA */}
              <div className="bg-gradient-to-r from-emerald-500/10 via-indigo-500/5 to-transparent border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-sm">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span>¿Tienes una nota o captura de medidas?</span>
                      <span className="bg-indigo-100 text-indigo-800 text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full">IA Activa</span>
                    </h4>
                    <p className="text-xs text-slate-500">Escanea bocetos, notas de pedidos, chats o medidas físicas con nuestra IA.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOcrModal(true)}
                  className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-md shrink-0 focus:outline-none"
                  id="scan-order-ia-btn"
                >
                  <Camera className="w-4 h-4 animate-bounce" />
                  <span>Escanear Pedidos con IA</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Código de Orden</label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                    placeholder="Código de la orden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 font-sans">Tipo de Prenda</label>
                  <select
                    value={["Blusa", "Pollera", "Faja"].includes(garmentType) ? garmentType : "Blusa"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGarmentType(val);
                      if (val === "Blusa") {
                        setTallaBlusa("M");
                      } else {
                        setTallaAnaco("32");
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition cursor-pointer font-sans font-semibold text-slate-800"
                  >
                    <option value="Blusa">Blusa</option>
                    <option value="Pollera">Pollera / Anaco</option>
                    <option value="Faja">Faja</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cantidad (Unid.)</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de Entrega Límite</label>
                  <input
                    type="date"
                    value={limitDate}
                    onChange={(e) => setLimitDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition font-mono"
                  />
                </div>
              </div>

              {/* Información de Cliente y Sección Financiera Integrada (CXC / Contabilidad de Sisa) */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-600" />
                    <span>Datos de Facturación y Contacto</span>
                  </h4>
                  <span className="bg-emerald-100 text-emerald-800 text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full">CXC & Finanzas</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Completo del Cliente</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
                      placeholder="Ej: María de la Cruz"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de Identificación</label>
                    <select
                      value={clientIdType}
                      onChange={(e) => setClientIdType(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition cursor-pointer text-slate-700 font-sans"
                    >
                      <option value="cédula">Cédula</option>
                      <option value="ruc">RUC</option>
                      <option value="pasaporte">Pasaporte</option>
                      <option value="consumidor_final">Consumidor Final</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Número de Identificación</label>
                    <input
                      type="text"
                      value={clientIdNumber}
                      onChange={(e) => setClientIdNumber(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition font-mono"
                      placeholder="Ej: 1004567891"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-sans">Teléfono o Celular</label>
                    <input
                      type="text"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition font-mono"
                      placeholder="Ej: 0998877665"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Dirección del Cliente</label>
                    <input
                      type="text"
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
                      placeholder="Ej: Calle Espejo y Sucre, Otavalo"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Valor Venta ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={valorPrenda}
                      onChange={(e) => setValorPrenda(e.target.value === "" ? "" : parseFloat(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition font-mono text-slate-800 font-semibold"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Anticipo ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={anticipo}
                      onChange={(e) => setAnticipo(e.target.value === "" ? "" : parseFloat(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition font-mono text-slate-800 font-semibold"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Saldo de Cobro ($)</label>
                    <input
                      type="number"
                      readOnly
                      disabled
                      value={saldo}
                      className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-rose-600 font-bold cursor-not-allowed"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Diseño / Boceto de Prenda
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    {/* URL Input and DragZone */}
                    <div className="sm:col-span-2 space-y-2">
                      <input
                        type="url"
                        value={patternUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPatternUrl(val);
                          if (localPreviewUrl) {
                            URL.revokeObjectURL(localPreviewUrl);
                            setLocalPreviewUrl("");
                          }
                        }}
                        onPaste={(e) => {
                          const pastedText = e.clipboardData.getData("text");
                          if (pastedText) {
                            setPatternUrl(pastedText.trim());
                            if (localPreviewUrl) {
                              URL.revokeObjectURL(localPreviewUrl);
                              setLocalPreviewUrl("");
                            }
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition font-mono"
                        placeholder="Pega enlace de boceto externo (Ej: Unsplash, Pinterest) o sube un archivo"
                      />

                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragging(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                        onClick={() => document.getElementById("file-upload-input")?.click()}
                        className={`border-2 border-dashed rounded-xl p-3.5 text-center transition-all cursor-pointer ${
                          isDragging 
                            ? "border-emerald-500 bg-emerald-50/50" 
                            : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="file"
                          id="file-upload-input"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                        />
                        <FileUp className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                        <p className="text-[10px] font-semibold text-slate-600">
                          Suelte su boceto o <span className="text-emerald-600 font-bold">busque archivo</span>
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5">JPG, PNG o WEBP (Máx. 5MB)</p>
                      </div>

                      {uploadPercent !== null && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-emerald-600">
                            <span>Subiendo boceto...</span>
                            <span>{uploadPercent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-150" 
                              style={{ width: `${uploadPercent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {uploadError && (
                        <p className="text-[9px] font-medium text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                          {uploadError}
                        </p>
                      )}
                    </div>

                    {/* Previsualización */}
                    <div className="h-[110px] bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center p-1.5 overflow-hidden relative w-full">
                      {(patternUrl || localPreviewUrl) ? (
                        <div className="relative w-full h-full group">
                          <img
                            src={patternUrl || localPreviewUrl}
                            alt="Boceto de prenda"
                            className="w-full h-full object-cover rounded-lg"
                            referrerPolicy="no-referrer"
                            style={{ display: "block", width: "100%", height: "100%" }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPatternUrl("");
                              if (localPreviewUrl) {
                                URL.revokeObjectURL(localPreviewUrl);
                                setLocalPreviewUrl("");
                              }
                              const fileInput = document.getElementById("file-upload-input") as HTMLInputElement;
                              if (fileInput) fileInput.value = "";
                            }}
                            className="absolute top-1 right-1 bg-slate-900/90 hover:bg-red-600 text-white w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center transition shadow-sm hover:scale-110 active:scale-95 z-10"
                            title="Eliminar imagen"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="text-center p-4">
                          <p className="text-[10px] text-slate-400 font-medium">Boceto de Prenda</p>
                          <p className="text-[8px] text-slate-350">Sin previsualización</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Asignar Profesional Responsable</label>
                <select
                  value={assignedOperatorId}
                  onChange={(e) => setAssignedOperatorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                >
                  <option value="">Selecciona una operaria...</option>
                  {operators.map((op) => (
                    <option key={op.uid} value={op.uid}>
                      {op.name} ({op.email})
                    </option>
                  ))}
                </select>
                {operators.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>No hay operarios registrados en la base de datos (inicia sesión con perfiles demo de operarios para registrarlos).</span>
                  </p>
                )}
              </div>
              {/* Interactive Widget: Medidas y Detalles de la Prenda */}
              {/* ------------------------------------------------------------- */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mt-2 space-y-4 font-sans text-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                    <span>📏 Ficha Técnica: {normalizedPrenda === "Blusa" ? "Blusa de Vestir" : normalizedPrenda === "Pollera" ? "Pollera / Anaco" : "Faja Regional"}</span>
                    <span className="bg-indigo-100 text-indigo-850 text-[9px] font-black px-2 py-0.5 rounded-full">{modalidad === "Talla" ? "Por Talla" : "Por Medidas"}</span>
                  </h4>
                  {/* Radio buttons for Modalidad selection (Modo de Registro) */}
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-bold select-none">
                      <input
                        type="radio"
                        name="modalidadPrenda"
                        value="Talla"
                        checked={modalidad === "Talla"}
                        onChange={() => setModalidad("Talla")}
                        className="text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4.5 h-4.5"
                      />
                      <span>Por Talla</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-bold select-none">
                      <input
                        type="radio"
                        name="modalidadPrenda"
                        value="Medidas"
                        checked={modalidad === "Medidas"}
                        onChange={() => setModalidad("Medidas")}
                        className="text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4.5 h-4.5"
                      />
                      <span>Por Medidas</span>
                    </label>
                  </div>
                </div>

                {/* CONDITIONAL RENDER: POR TALLA */}
                {modalidad === "Talla" ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-down items-end">
                    {/* Unique talla dropdown adapted specifically to the garment type selected */}
                    {normalizedPrenda === "Blusa" ? (
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                          Talla de Blusa (S, M, L, XL)
                        </label>
                        <select
                          value={tallaBlusa || "M"}
                          onChange={(e) => setTallaBlusa(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-sans cursor-pointer"
                        >
                          <option value="S">S</option>
                          <option value="M">M</option>
                          <option value="L">L</option>
                          <option value="XL">XL</option>
                          <option value="XXL">XXL</option>
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                          Escala de Confección ({normalizedPrenda})
                        </label>
                        <input
                          type="text"
                          value={tallaAnaco}
                          list="numeric-range-5-100"
                          onChange={(e) => setTallaAnaco(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-mono shadow-sm"
                          placeholder="Escribe o selecciona (5-100)"
                        />
                      </div>
                    )}

                    {/* Color field is kept visible as specified */}
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Color de {normalizedPrenda === "Blusa" ? "la Blusa" : normalizedPrenda === "Pollera" ? "la Pollera" : "la Faja"}
                      </label>
                      <input
                        type="text"
                        value={colorBlusa}
                        onChange={(e) => setColorBlusa(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                        placeholder="Crema con bordado, blanco, etc."
                      />
                    </div>

                    {/* ¿Cliente deja tela? button matches specified garment type */}
                    {normalizedPrenda === "Blusa" ? (
                      <div>
                        <label className="text-[10px] font-bold text-slate-505 block mb-1">
                          Tela Blusa: ¿Cliente la deja?
                        </label>
                        <button
                          type="button"
                          onClick={() => setDejaTelaBlusa(!dejaTelaBlusa)}
                          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border h-[38px] ${
                            dejaTelaBlusa
                              ? "bg-amber-500/15 border-amber-300 text-amber-700 font-black"
                              : "bg-emerald-500/15 border-emerald-300 text-emerald-700 font-black"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${dejaTelaBlusa ? "bg-amber-600 animate-pulse" : "bg-emerald-600"}`} />
                          <span>{dejaTelaBlusa ? "SÍ (Bajo $0)" : "NO (Restar stock)"}</span>
                        </button>
                      </div>
                    ) : normalizedPrenda === "Pollera" ? (
                      <div>
                        <label className="text-[10px] font-bold text-slate-505 block mb-1">
                          Tela Pollera: ¿Cliente la deja?
                        </label>
                        <button
                          type="button"
                          onClick={() => setDejaTelaPollera(!dejaTelaPollera)}
                          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border h-[38px] ${
                            dejaTelaPollera
                              ? "bg-amber-500/15 border-amber-300 text-amber-700 font-black"
                              : "bg-emerald-500/15 border-emerald-300 text-emerald-700 font-black"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${dejaTelaPollera ? "bg-amber-600 animate-pulse" : "bg-emerald-600"}`} />
                          <span>{dejaTelaPollera ? "SÍ (Bajo $0)" : "NO (Restar stock)"}</span>
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-bold text-slate-505 block mb-1">
                          Tela Faja: ¿Cliente la deja?
                        </label>
                        <button
                          type="button"
                          onClick={() => setDejaTelaFaja(!dejaTelaFaja)}
                          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border h-[38px] ${
                            dejaTelaFaja
                              ? "bg-amber-500/15 border-amber-300 text-amber-700 font-black"
                              : "bg-emerald-500/15 border-emerald-300 text-emerald-700 font-black"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${dejaTelaFaja ? "bg-amber-600 animate-pulse" : "bg-emerald-600"}`} />
                          <span>{dejaTelaFaja ? "SÍ (Bajo $0)" : "NO (Restar stock)"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* CONDITIONAL RENDER: POR MEDIDAS */
                  <div className="animate-fade-in-down space-y-4">
                    {normalizedPrenda === "Blusa" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* 1. AE */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              1. Ancho Espalda (AE)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={anchoEspalda}
                              onChange={(e) => setAnchoEspalda(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 2. TE */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              2. Talle Espalda (TE)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={talleEspalda}
                              onChange={(e) => setTalleEspalda(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 3. CB */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              3. Contorno Busto (CB)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={contornoBusto}
                              onChange={(e) => setContornoBusto(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 4. CCin */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              4. Contorno Cintura (CCin)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={contornoCintura}
                              onChange={(e) => setContornoCintura(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 5. CK */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              5. Contorno Cadera (CK)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={contornoCadera}
                              onChange={(e) => setContornoCadera(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 6. LM */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              6. Largo Manga (LM)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={largoManga}
                              onChange={(e) => setLargoManga(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 7. LB */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              7. Largo Total Blusa (LB)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={largoTotalBlusa}
                              onChange={(e) => setLargoTotalBlusa(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 8. Puño */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              8. Puño (cm)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={puno}
                              onChange={(e) => setPuno(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 9. Pinza */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              9. Pinza (cm)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={pinza}
                              onChange={(e) => setPinza(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 10. Brazo */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              10. Brazo (cm)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={brazo}
                              onChange={(e) => setBrazo(e.target.value === "" ? "" : Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-550 outline-none font-mono text-slate-800"
                              placeholder="cm"
                            />
                          </div>

                          {/* 11. Color Blusa */}
                          <div className="md:col-span-2 col-span-1">
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5">
                              11. Color de la blusa
                            </label>
                            <input
                              type="text"
                              value={colorBlusa}
                              onChange={(e) => setColorBlusa(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                              placeholder="blanco, crema, bordado rojo, etc..."
                            />
                          </div>
                        </div>

                        {/* Control exclusivo Tela Blusa */}
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 max-w-xs">
                          <label className="text-[10px] font-bold text-slate-550 block mb-1">
                            Tela Blusa: ¿Cliente la deja? (SI/NO)
                          </label>
                          <button
                            type="button"
                            onClick={() => setDejaTelaBlusa(!dejaTelaBlusa)}
                            className={`w-full mt-1.5 py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
                              dejaTelaBlusa
                                ? "bg-amber-500/15 border-amber-300 text-amber-700 font-black"
                                : "bg-emerald-500/15 border-emerald-300 text-emerald-700 font-black"
                            }`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${dejaTelaBlusa ? "bg-amber-600 animate-pulse" : "bg-emerald-600"}`} />
                            <span>{dejaTelaBlusa ? "SÍ (Bajo $0)" : "NO (Restar stock)"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {normalizedPrenda === "Pollera" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              Ancho Pollera (AP) (cm)
                            </label>
                            <input
                              type="text"
                              value={anchoPollera}
                              list="numeric-range-5-100"
                              onChange={(e) => setAnchoPollera(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800 shadow-sm"
                              placeholder="Escribe o selecciona (5-100)"
                            />
                          </div>

                          {/* Color field */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5">
                              Color de la Pollera
                            </label>
                            <input
                              type="text"
                              value={colorBlusa}
                              onChange={(e) => setColorBlusa(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                              placeholder="Ej. Azul marino, negro..."
                            />
                          </div>

                          {/* Control Tela Pollera */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5">
                              Tela Pollera: ¿Cliente la deja? (SI/NO)
                            </label>
                            <button
                              type="button"
                              onClick={() => setDejaTelaPollera(!dejaTelaPollera)}
                              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border h-[42px] ${
                                dejaTelaPollera
                                  ? "bg-amber-500/15 border-amber-300 text-amber-700 font-black"
                                  : "bg-emerald-500/15 border-emerald-300 text-emerald-700 font-black"
                              }`}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${dejaTelaPollera ? "bg-amber-600 animate-pulse" : "bg-emerald-600"}`} />
                              <span>{dejaTelaPollera ? "SÍ (Bajo $0)" : "NO (Restar stock)"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {normalizedPrenda === "Faja" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5 truncate">
                              Faja (cm)
                            </label>
                            <input
                              type="text"
                              value={faja}
                              list="numeric-range-5-100"
                              onChange={(e) => setFaja(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800 shadow-sm"
                              placeholder="Escribe o selecciona (5-100)"
                            />
                          </div>

                          {/* Color field */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5">
                              Color de la Faja
                            </label>
                            <input
                              type="text"
                              value={colorBlusa}
                              onChange={(e) => setColorBlusa(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                              placeholder="Ej. Bordado multicolor, rojo..."
                            />
                          </div>

                          {/* Control Tela Faja */}
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 block mb-1.5">
                              Tela Faja: ¿Cliente la deja? (SI/NO)
                            </label>
                            <button
                              type="button"
                              onClick={() => setDejaTelaFaja(!dejaTelaFaja)}
                              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border h-[42px] ${
                                dejaTelaFaja
                                  ? "bg-amber-500/15 border-amber-300 text-amber-700 font-black"
                                  : "bg-emerald-500/15 border-emerald-300 text-emerald-700 font-black"
                              }`}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${dejaTelaFaja ? "bg-amber-600 animate-pulse" : "bg-emerald-600"}`} />
                              <span>{dejaTelaFaja ? "SÍ (Bajo $0)" : "NO (Restar stock)"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shared datalist helper element for hybrid select logic */}
                    <datalist id="numeric-range-5-100">
                      {Array.from({ length: 96 }, (_, i) => i + 5).map((num) => (
                        <option key={num} value={num} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observaciones / Especificaciones de Costura</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition"
                  placeholder="Detalla puntadas, cortes o hilos de pespunte decorativo..."
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowOrderForm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-xs font-bold transition shadow-sm"
                >
                  {editingOrder ? "Guardar Cambios" : "Lanzar en Taller"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Immersive Magnified Sketch Zoom Overlay */}
      {zoomedImageUrl && (
        <div 
          className="fixed inset-0 bg-slate-900/85 flex items-center justify-center p-4 z-[9999] animate-fade-in cursor-zoom-out"
          onClick={() => setZoomedImageUrl(null)}
        >
          <div 
            className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden p-2 flex flex-col items-center shadow-2xl scale-100 transition-transform duration-300 m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomedImageUrl(null)}
              className="absolute top-4 right-4 bg-slate-900/90 hover:bg-red-600 text-white w-8 h-8 rounded-full font-bold flex items-center justify-center transition-all shadow-lg hover:scale-110 active:scale-95 z-20"
              title="Cerrar vista"
            >
              ✕
            </button>
            <div className="w-full overflow-auto max-h-[80vh] flex items-center justify-center bg-slate-100 rounded-xl">
              <img
                src={zoomedImageUrl}
                alt="Boceto ampliado de prenda"
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg p-1"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="py-3 px-4 w-full flex items-center justify-between text-xs text-slate-500 font-sans border-t border-slate-100 mt-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <span>📏 Boceto de Diseño en Taller</span>
              </span>
              <span>Haz clic fuera para cerrar</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* Sub-modal: Escanear Pedidos con IA */}
      {/* ============================================================= */}
      {showOcrModal && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 flex flex-col">
            {/* Header */}
            <div className="bg-indigo-950 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold font-display text-sm tracking-tight">Escáner de Pedidos & Fichas con IA</h3>
              </div>
              <button 
                type="button"
                onClick={handleCloseOcr} 
                className="text-slate-400 hover:text-white font-bold px-2 rounded hover:bg-slate-850 transition"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4 font-sans text-slate-800">
              
              {/* If no preview url and no loading, show massive upload dropzone */}
              {!ocrPreviewUrl && !ocrLoading && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOcrDragging(true);
                  }}
                  onDragLeave={() => setOcrDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOcrDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleOcrFileSelection(file);
                  }}
                  onClick={() => document.getElementById("ocr-file-upload-input")?.click()}
                  className={`border-3 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                    ocrDragging 
                      ? "border-emerald-500 bg-emerald-50" 
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="file"
                    id="ocr-file-upload-input"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleOcrFileSelection(file);
                    }}
                  />
                  <div className="bg-teal-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                    <Camera className="w-6 h-6 text-teal-600" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-705 uppercase tracking-widest mb-1 font-sans">Cargar boceto o captura de medidas</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed mt-2">
                    Arrastra o selecciona un boceto a mano, captura de WhatsApp, hoja física o diseño textil. Nuestra IA extraerá automáticamente las medidas y detalles para ti.
                  </p>
                  <span className="inline-block mt-4 text-xs font-bold bg-white text-emerald-600 px-3.5 py-1.5 rounded-full border border-slate-200 hover:border-emerald-500 transition shadow-sm">
                    Elegir Archivo
                  </span>
                </div>
              )}

              {/* If we have an image preview/state */}
              {ocrPreviewUrl && (
                <div className="space-y-4">
                  {/* Image render */}
                  <div className="relative h-48 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center">
                    <img 
                      src={ocrPreviewUrl} 
                      alt="Archivo cargado para escáner"
                      className="h-full w-auto object-contain p-2"
                    />
                    {ocrLoading && (
                      <div className="absolute inset-0 bg-slate-900/70 flex flex-col items-center justify-center text-white p-4">
                        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-xs font-bold text-center animate-pulse">
                          Procesando imagen con Visión Artificial...
                        </p>
                        <p className="text-[10px] text-slate-300 mt-1 max-w-xs text-center">
                          Analizando trazos, anotaciones métricas en centímetros y especificaciones del pedido. Estabilidad certificada.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Soft alert matching the exact requested string on failure / blank measures */}
                  {ocrError && (
                    <div className="bg-amber-50 border border-amber-250 p-4 rounded-xl text-amber-800 text-xs font-sans space-y-2 animate-fade-in flex flex-col items-center text-center">
                      <HelpCircle className="w-8 h-8 text-amber-600 mb-1" />
                      <strong className="text-xs font-black uppercase tracking-wider text-amber-900 font-sans">Lectura Incompleta</strong>
                      <p className="font-semibold leading-relaxed max-w-md">
                        {ocrError}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setOcrError("");
                          setOcrResult(null);
                          setOcrPreviewUrl("");
                          setOcrBase64("");
                        }}
                        className="mt-2 text-[10px] uppercase font-bold tracking-wider text-amber-900 hover:underline"
                      >
                        Intentar con otra foto
                      </button>
                    </div>
                  )}

                  {/* Display extracted data list if reading was successful */}
                  {ocrResult && !ocrLoading && (
                    <div className="bg-indigo-50/30 border border-indigo-100 p-4 rounded-xl space-y-3 animate-fade-in-down max-h-60 overflow-y-auto">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5">
                        <span className="text-[11px] font-black uppercase text-indigo-800 tracking-wider flex items-center gap-1.5">
                          ✓ Datos Detectados por la IA
                        </span>
                        <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase font-sans">
                          Modalidad: {ocrResult.modalidad || "Medidas"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs leading-relaxed">
                        <div>
                          <span className="text-slate-400 font-medium">Tipo Prenda:</span>
                          <span className="font-bold text-slate-800 block">{ocrResult.garmentType || "No detectado"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium">Color Estimado:</span>
                          <span className="font-bold text-slate-800 block">{ocrResult.color || "No detectado"}</span>
                        </div>
                        {ocrResult.notes && (
                          <div className="col-span-2">
                            <span className="text-slate-400 font-medium">Observaciones detectadas:</span>
                            <span className="font-bold text-slate-800 block italic bg-white p-2 rounded border border-slate-150 mt-1">"{ocrResult.notes}"</span>
                          </div>
                        )}

                        {/* Measurements section */}
                        <div className="col-span-2 border-t border-indigo-100/50 pt-2.5 space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider font-sans">Medidas en centímetro (cm):</span>
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            {/* Ancho Espalda */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">1. AE (Espalda)</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.anchoEspalda || "—"}</span>
                            </div>
                            {/* Talle Espalda */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block font-sans">2. TE (Talle)</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.talleEspalda || "—"}</span>
                            </div>
                            {/* Contorno Busto */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">3. CB (Busto)</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.contornoBusto || "—"}</span>
                            </div>
                            {/* Contorno Cintura */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">4. CCin (Cintura)</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.contornoCintura || "—"}</span>
                            </div>
                            {/* Contorno Cadera */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">5. CK (Cadera)</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.contornoCadera || "—"}</span>
                            </div>
                            {/* Largo Manga */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">6. LM (Manga)</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.largoManga || "—"}</span>
                            </div>
                            {/* Largo Total Blusa */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">7. LB (Largo)</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.largoTotalBlusa || "—"}</span>
                            </div>
                            {/* Puño */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">8. Puño</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.puno || "—"}</span>
                            </div>
                            {/* Pinza */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">9. Pinza</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.pinza || "—"}</span>
                            </div>
                            {/* Brazo */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">10. Brazo</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.brazo || "—"}</span>
                            </div>
                            {/* Ancho Pollera */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">AP Pollera</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.anchoPollera || "—"}</span>
                            </div>
                            {/* Faja */}
                            <div className="bg-white p-1.5 rounded border border-slate-150 flex flex-col items-center">
                              <span className="text-slate-400 text-[8px] font-bold block">Faja</span>
                              <span className="font-mono font-black text-indigo-800">{ocrResult.faja || "—"}</span>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Actions Footer */}
            <div className="bg-slate-50 px-6 py-4 flex gap-3 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={handleCloseOcr}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition focus:outline-none"
              >
                Volver
              </button>
              {ocrResult && !ocrLoading && (
                <button
                  type="button"
                  onClick={handleApplyOcrResult}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-md focus:outline-none"
                >
                  Inyectar y Auto-llenar Formulario
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* Sub-modal: Control de Excepción y Digitación Manual de ID */}
      {/* ============================================================= */}
      {showIdRequiredModal && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-[110] animate-fade-in font-sans">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-100 flex flex-col">
            <div className="bg-rose-900 text-white p-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-rose-300" />
              <h3 className="font-bold text-sm tracking-tight font-display">Identidad Requerida</h3>
            </div>
            
            <div className="p-5 space-y-4 text-slate-800 text-xs">
              <p className="text-slate-500 leading-relaxed font-semibold">
                La hoja escaneada no contiene el número de Cédula o RUC (o la información está incompleta). Digite manualmente los datos para evitar registros duplicados.
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-sans">
                    Tipo de Identificación
                  </label>
                  <select
                    value={clientIdType}
                    onChange={(e) => setClientIdType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-500 transition cursor-pointer text-slate-700 font-bold"
                  >
                    <option value="cédula">Cédula</option>
                    <option value="ruc">RUC</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 font-sans">
                    Nº de Identificación
                  </label>
                  <input
                    type="text"
                    value={clientIdNumber}
                    onChange={(e) => setClientIdNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder={clientIdType === "cédula" ? "Ej: 1004567891 (10 dígitos)" : "Ej: 1004567891001 (13 dígitos)"}
                    maxLength={clientIdType === "cédula" ? 10 : 13}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-rose-500 transition"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic font-semibold">
                    Requerido para vincular la orden con el historial de Sisa.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 px-5 py-3.5 flex gap-2 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowIdRequiredModal(false);
                  setPendingOcrData(null);
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition focus:outline-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  clientIdType === "cédula" 
                    ? clientIdNumber.trim().length !== 10 
                    : clientIdNumber.trim().length !== 13
                }
                onClick={() => {
                  if (pendingOcrData) {
                    const enriched = {
                      ...pendingOcrData,
                      clientIdType,
                      clientIdNumber: clientIdNumber.trim(),
                    };
                    setShowIdRequiredModal(false);
                    setPendingOcrData(null);
                    applyOcrDataToForm(enriched);
                  }
                }}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow"
              >
                Inyectar y Auto-llenar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* Sub-modal: Reporte de Tiempos y Ruta de Producción (Hoja de Ruta) */}
      {/* ============================================================= */}
      {selectedRoadmapOrder && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-[100] animate-fade-in font-sans">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-widest font-display">Ruta de Confección & Tiempos</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoadmapOrder(null)}
                className="text-slate-400 hover:text-white font-bold p-1 rounded transition"
              >
                ✕
              </button>
            </div>

            {/* Scrollable ticket body */}
            <div className="p-6 overflow-y-auto space-y-6 text-slate-800 text-xs text-left">
              
              {/* Traditional Ticket Style Container */}
              <div className="bg-amber-50/30 rounded-2xl border-2 border-dashed border-slate-350 p-5 space-y-4">
                {/* Brand header */}
                <div className="text-center pb-2.5 border-b border-slate-205">
                  <h4 className="font-black text-xs uppercase tracking-widest text-slate-900 font-display">SISA CREACIONES</h4>
                  <p className="text-[10px] text-slate-505 font-bold uppercase mt-0.5">Boleto de Taller Tradicional</p>
                  <p className="text-[9px] text-indigo-700 font-mono font-bold mt-1">Orden Nº: {selectedRoadmapOrder.orderNumber}</p>
                </div>

                {/* Times extraction & Countdown clocks */}
                <div className="grid grid-cols-2 gap-4 pb-3 border-b border-slate-200">
                  <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block font-sans">Creación en Taller:</span>
                    <span className="font-extrabold text-slate-800 text-xs block">
                      {selectedRoadmapOrder.createdAt ? new Date(selectedRoadmapOrder.createdAt).toLocaleDateString() : "N/A"}
                    </span>
                    <span className="text-[11px] text-indigo-650 font-bold block bg-indigo-50 px-2.5 py-0.5 rounded-full w-fit">
                      {getElapsedString(selectedRoadmapOrder.createdAt)}
                    </span>
                  </div>

                  <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-405 block font-sans">Meta de Entrega:</span>
                      <span className="font-extrabold text-slate-800 text-xs block">{selectedRoadmapOrder.limitDate}</span>
                    </div>
                    <span className="text-[10px] uppercase font-black tracking-wider text-rose-600 font-mono block animate-pulse truncate" title="Cronómetro regresivo">
                      ⏳ {getCountdownTimer(selectedRoadmapOrder.limitDate)}
                    </span>
                  </div>
                </div>

                {/* Cliente / Contact particulars */}
                <div className="space-y-2 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Ficha del Cliente:</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-white/70 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[9px] text-slate-404 block uppercase font-bold">Nombres:</span>
                      <span className="font-black text-slate-800">{selectedRoadmapOrder.clientName || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-404 block uppercase font-bold">Documento ID:</span>
                      <span className="font-mono text-slate-805 font-bold">
                        {selectedRoadmapOrder.clientIdNumber ? `(${selectedRoadmapOrder.clientIdType || "cédula"}) ${selectedRoadmapOrder.clientIdNumber}` : "No registrado"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[9px] text-slate-404 block uppercase font-bold">Dirección:</span>
                      <span className="font-bold text-slate-700">{selectedRoadmapOrder.clientAddress || "Sin Dirección Particular"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-404 block uppercase font-bold">Teléfono:</span>
                      <span className="font-mono text-slate-800 font-semibold">{selectedRoadmapOrder.clientPhone || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Garment / Specs ticket elements */}
                <div className="space-y-2 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Prenda & Acabados:</span>
                  <div className="bg-white/70 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-semibold">Prenda:</span>
                      <strong className="text-slate-800 uppercase">{selectedRoadmapOrder.garmentType}</strong>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-semibold">Cantidad:</span>
                      <strong className="text-slate-800">{selectedRoadmapOrder.quantity} unidades</strong>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-semibold">Talla / Dimensiones:</span>
                      <strong className="text-slate-800 font-sans">Talla {selectedRoadmapOrder.size} | Color: {selectedRoadmapOrder.color}</strong>
                    </div>
                    {selectedRoadmapOrder.notes && (
                      <div className="bg-slate-50 p-2 rounded text-[10px] text-slate-500 italic border border-slate-100">
                        {selectedRoadmapOrder.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial overview ticket style */}
                <div className="space-y-2 text-xs">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Balance Financiero:</span>
                  <div className="grid grid-cols-3 gap-2 bg-slate-900 text-white p-3 rounded-xl text-center">
                    <div>
                      <span className="text-[8px] text-slate-403 block uppercase font-black">Total</span>
                      <span className="font-mono text-xs font-black">${(selectedRoadmapOrder.valorPrenda || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-slate-403 block uppercase font-black">Anticipo</span>
                      <span className="font-mono text-xs font-black text-emerald-400">${(selectedRoadmapOrder.anticipo || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-slate-403 block uppercase font-black">Saldo</span>
                      <span className="font-mono text-xs font-black text-rose-400">${(selectedRoadmapOrder.saldo || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline Production Roadmap */}
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase font-black text-slate-500 tracking-widest block">Ruta de Producción del Taller</h4>
                <div className="space-y-4 relative pl-5 border-l-2 border-indigo-100 ml-2.5 py-1">
                  {statusList.map((st, i) => {
                    const currentStatusIndex = statusList.indexOf(selectedRoadmapOrder.status);
                    const isPassed = i < currentStatusIndex;
                    const isActive = i === currentStatusIndex;
                    
                    return (
                      <div key={st} className="relative text-xs">
                        {/* Node marker bubble */}
                        <div 
                          className={`absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 transition ${
                            isActive 
                              ? "bg-indigo-650 border-indigo-610 ring-4 ring-indigo-50 scale-110 animate-pulse" 
                              : isPassed 
                                ? "bg-slate-900 border-slate-900" 
                                : "bg-white border-slate-200"
                          }`}
                        >
                          {isPassed && <span className="text-[7.5px] text-white font-extrabold">✓</span>}
                        </div>

                        {/* Title text */}
                        <div className="flex items-center justify-between">
                          <span className={`${isActive ? "font-black text-indigo-700 text-xs" : isPassed ? "text-slate-800 font-bold" : "text-slate-404 font-medium"}`}>
                            {st}
                          </span>
                          {isActive && (
                            <span className="bg-indigo-150 text-indigo-800 text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full animate-pulse">
                              FASE ACTIVA
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Actions Footer */}
            <div className="bg-slate-100 px-6 py-4 flex gap-3 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={() => setSelectedRoadmapOrder(null)}
                className="bg-slate-200 hover:bg-slate-350 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition focus:outline-none"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-slate-900 hover:bg-slate-805 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow flex items-center gap-1.5"
              >
                🖨️ Imprimir Boleto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
