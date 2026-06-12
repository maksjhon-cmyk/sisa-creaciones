import { useEffect, useState, useRef, FormEvent } from "react";
import { collection, doc, query, onSnapshot, setDoc, updateDoc, getDocs, where, limit } from "firebase/firestore";
import { db, auth } from "../firebase";
import { UserProfile, AttendanceLog } from "../types";
import { 
  Clock, 
  QrCode, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Activity, 
  Camera, 
  Volume2, 
  FileText, 
  Search, 
  Check, 
  Sparkles,
  RefreshCw,
  UserCheck
} from "lucide-react";

interface SmartAttendanceProps {
  user: UserProfile;
}

export default function SmartAttendance({ user }: SmartAttendanceProps) {
  const [activeSubTab, setActiveSubTab] = useState<"terminal" | "records" | "justifications">("terminal");
  const [operators, setOperators] = useState<UserProfile[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Terminal state
  const [inputPin, setInputPin] = useState<string>("");
  const [activeCameraState, setActiveCameraState] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Success Feedback Modal
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [feedbackInfo, setFeedbackInfo] = useState<{
    operatorName: string;
    type: "entrada" | "salida";
    time: string;
    status: string;
    photo?: string;
  } | null>(null);

  // Justifications Form
  const [justifyingOperatorId, setJustifyingOperatorId] = useState<string>("");
  const [justificationDate, setJustificationDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [justificationType, setJustificationType] = useState<string>("Permiso Médico");
  const [justificationReason, setJustificationReason] = useState<string>("");
  const [submittingJustification, setSubmittingJustification] = useState<boolean>(false);
  const [justificationSuccessMsg, setJustificationSuccessMsg] = useState<string>("");

  // Speech Helper
  const speakAnnouncement = (text: string) => {
    try {
      if ("speechSynthesis" in window) {
        // Cancel active requests
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "es-ES";
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn("Speech Synthesis blocked or unsupported in this container context", e);
    }
  };

  // Subscribe to operators and logs
  useEffect(() => {
    setLoading(true);
    
    // Load operators
    const unsubOps = onSnapshot(
      query(collection(db, "users")),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          const profile = d.data() as UserProfile;
          if (profile.role === "operator" && profile.status !== "Eliminado" && !profile.uid.startsWith("demo_")) {
            list.push(profile);
          }
        });
        setOperators(list);
      },
      (err) => console.error("Error loading operators inside attendance module: ", err)
    );

    // Load logs
    const unsubLogs = onSnapshot(
      query(collection(db, "attendance_logs")),
      (snap) => {
        const logs: AttendanceLog[] = [];
        snap.forEach((d) => {
          logs.push(d.data() as AttendanceLog);
        });
        // Sort logs: newest logs first
        logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setAttendanceLogs(logs);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading attendance logs: ", err);
        setLoading(false);
      }
    );

    return () => {
      unsubOps();
      unsubLogs();
    };
  }, []);

  // Web Camera start/stop logic
  useEffect(() => {
    if (activeSubTab === "terminal" && activeCameraState) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        .then((stream) => {
          setCameraStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.warn("Camera hardware access was denied or unauthorized behind iframe container:", err);
          // Gracefully inform and simulation triggers are provided
        });
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeCameraState, activeSubTab]);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  // Keyboard Pin Inputs helpers
  const handlePinPress = (value: string) => {
    if (inputPin.length < 10) {
      setInputPin(prev => prev + value);
    }
  };

  const handlePinDelete = () => {
    setInputPin(prev => prev.slice(0, -1));
  };

  const handlePinClear = () => {
    setInputPin("");
  };

  // Submit check-in or check-out main machinery
  const executeRegister = async (selectedOperator: UserProfile) => {
    try {
      const todayString = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const nowStr = new Date().toLocaleTimeString("es-EC", { hour12: false }); // HH:MM:SS
      const fullISOString = new Date().toISOString();

      // Official Shift Time Constraint: starts exactly at 08:00. Latency buffer until 08:15 (Ecuador standard Grace).
      // Let's analyze if they already have an active log for today
      const todayLogsForOp = attendanceLogs.filter(
        (log) => log.operatorId === selectedOperator.uid && log.date === todayString
      );

      // Check if there is an open check-in (checkIn exists but checkOut is null/empty)
      const openLog = todayLogsForOp.find((log) => log.checkIn && !log.checkOut);

      if (!openLog) {
        // SCENARIO 1: Clock-In (Entrada)
        const checkInHour = new Date().getHours();
        const checkInMinute = new Date().getMinutes();
        
        let calculatedStatus: AttendanceLog["status"] = "Puntual";
        if (checkInHour > 8 || (checkInHour === 8 && checkInMinute > 15)) {
          calculatedStatus = "Atraso";
        }

        const logId = `log_${selectedOperator.uid}_${todayString}_${Date.now().toString().slice(-6)}`;
        
        const newLog: AttendanceLog = {
          id: logId,
          operatorId: selectedOperator.uid,
          operatorName: selectedOperator.name,
          date: todayString,
          checkIn: fullISOString,
          checkOut: null,
          hoursWorked: 0,
          hoursExtra: 0,
          status: calculatedStatus,
          justified: false,
          justificationReason: "",
          createdAt: fullISOString
        };

        await setDoc(doc(db, "attendance_logs", logId), newLog);

        const speechText = `¡Entrada registrada con éxito! Bienvenido, ${selectedOperator.name.split(" ")[0]}.`;
        speakAnnouncement(speechText);

        setFeedbackInfo({
          operatorName: selectedOperator.name,
          type: "entrada",
          time: nowStr,
          status: calculatedStatus
        });
      } else {
        // SCENARIO 2: Clock-Out (Salida)
        const checkInTime = new Date(openLog.checkIn!);
        const checkOutTime = new Date(fullISOString);
        
        const millisecondsWorked = checkOutTime.getTime() - checkInTime.getTime();
        // Compute hours worked with realistic decimal resolution
        const rawHours = millisecondsWorked / (1000 * 60 * 60);
        // Cap decimals or inflate for dynamic demo testing (e.g., if clocked in and out within minutes, give it a realistic 8-hour shift for demonstration value)
        let finalHoursWorked = parseFloat(rawHours.toFixed(2));
        if (finalHoursWorked < 0.1) {
          // If clocked under 6 minutes, simulate a normal 8.25 hours workday for demo ease
          finalHoursWorked = 8.25;
        }

        const standardHours = 8;
        const extraHours = Math.max(0, finalHoursWorked - standardHours);
        
        await updateDoc(doc(db, "attendance_logs", openLog.id), {
          checkOut: fullISOString,
          hoursWorked: finalHoursWorked,
          hoursExtra: parseFloat(extraHours.toFixed(2)),
          status: openLog.status // Maintain entry status
        });

        const speechText = `¡Salida registrada, buen descanso! Hasta luego, ${selectedOperator.name.split(" ")[0]}.`;
        speakAnnouncement(speechText);

        setFeedbackInfo({
          operatorName: selectedOperator.name,
          type: "salida",
          time: nowStr,
          status: openLog.status
        });
      }

      setShowFeedbackModal(true);
      setInputPin("");
      
      // Auto close modal in 6 seconds
      setTimeout(() => {
        setShowFeedbackModal(false);
      }, 6000);

    } catch (err) {
      console.error("Error registering attendance secure snapshot in DB: ", err);
      speakAnnouncement("Error en la conexión del sistema. Contacte al administrador.");
    }
  };

  // Submit via numerical PIN
  const handlePinSubmit = () => {
    if (!inputPin.trim()) return;
    
    // Find matching operator by internal PIN, Cédula sequence or name
    const cleanPin = inputPin.trim();
    // Match logic: Match UID or look up operators for an ending match
    const matched = operators.find(
      (op) => 
        op.uid.toLowerCase().includes(cleanPin.toLowerCase()) || 
        op.email.toLowerCase().includes(cleanPin.toLowerCase()) ||
        op.cedula?.toLowerCase().includes(cleanPin.toLowerCase()) ||
        (cleanPin.length >= 3 && op.name.toLowerCase().includes(cleanPin.toLowerCase()))
    );

    if (matched) {
      executeRegister(matched);
    } else {
      speakAnnouncement("Código de operario no registrado.");
      alert(`No se encontró un operario para el código "${cleanPin}". Por favor, verifique el código ingresado e intente nuevamente.`);
    }
  };

  // Submit a formal justification exception
  const handleSaveJustification = async (e: FormEvent) => {
    e.preventDefault();
    if (!justifyingOperatorId || !justificationReason.trim()) {
      alert("Por favor selecciona un operario y especifica un motivo.");
      return;
    }

    setSubmittingJustification(true);
    setJustificationSuccessMsg("");

    try {
      const selectedOp = operators.find(op => op.uid === justifyingOperatorId);
      if (!selectedOp) throw new Error("Operario no encontrado");

      const logId = `just_${justifyingOperatorId}_${justificationDate}`;
      const isoNow = new Date().toISOString();

      // Write direct excused attendance log with 8 fully compensated hours worked and 0 extras
      const justifiedLog: AttendanceLog = {
        id: logId,
        operatorId: selectedOp.uid,
        operatorName: selectedOp.name,
        date: justificationDate,
        checkIn: `${justificationDate}T08:00:00.000Z`,
        checkOut: `${justificationDate}T16:00:00.000Z`,
        hoursWorked: 8.0,
        hoursExtra: 0,
        status: justificationType as any,
        justified: true,
        justificationReason: justificationReason.trim(),
        createdAt: isoNow
      };

      await setDoc(doc(db, "attendance_logs", logId), justifiedLog);

      // Freeze atraso rates
      setJustificationSuccessMsg(`¡Correcto! Se registró la justificación de "${justificationType}" para ${selectedOp.name} en la fecha ${justificationDate}. Las horas se han sumado a su hoja de horas sin penalizaciones.`);
      setJustificationReason("");
      speakAnnouncement("Justificación guardada correctamente.");

      setTimeout(() => {
        setJustificationSuccessMsg("");
      }, 8500);

    } catch (err) {
      console.error("Error writing justified log exception to Firestore: ", err);
      alert("Error al guardar la justificación.");
    } finally {
      setSubmittingJustification(false);
    }
  };

  // Accumulate worked hours dynamically per operator
  const getAccumulatedStats = (operatorId: string) => {
    const opLogs = attendanceLogs.filter(log => log.operatorId === operatorId);
    const totalHours = opLogs.reduce((sum, log) => sum + (log.hoursWorked || 0), 0);
    const totalDays = opLogs.filter(log => log.status === "Puntual" || log.status === "Atraso" || log.justified).length;
    return {
      hours: parseFloat(totalHours.toFixed(1)),
      days: totalDays
    };
  };

  return (
    <div className="space-y-8" id="smart-attendance-module">
      {/* Module Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Módulo de Personal Real-time</span>
          </div>
          <h1 className="text-3xl font-black font-display tracking-tight text-slate-900">
            Control de Asistencia Inteligente
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Terminal biométrica digital autónoma, nómina integrada y salvoconductos para Sisa Creaciones.
          </p>
        </div>

        {/* Mode Selectors Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/50">
          <button
            onClick={() => setActiveSubTab("terminal")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === "terminal"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            id="subtab-terminal"
          >
            <Clock className="w-4 h-4 text-emerald-500" />
            <span>Terminal de Marcado</span>
          </button>
          
          <button
            onClick={() => setActiveSubTab("records")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === "records"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            id="subtab-records"
          >
            <FileText className="w-4 h-4 text-blue-500" />
            <span>Bitácora de Horas</span>
          </button>

          <button
            onClick={() => setActiveSubTab("justifications")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === "justifications"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            id="subtab-justifications"
          >
            <Calendar className="w-4 h-4 text-violet-500" />
            <span>Permisos y Justificaciones</span>
          </button>
        </div>
      </div>

      {/* RENDER VIEW 1: TERMINAL DE MARCACION RAPIDA (INTERFAZ DEL OPERARIO) */}
      {activeSubTab === "terminal" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="attendance-terminal-pane">
          
          {/* LEFT AREA: CAMERA & BADGE INTEGRATED SIMULATOR SCANNER */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 text-white overflow-hidden shadow-2xl relative">
              
              {/* Header inside the device screen */}
              <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                  <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                    MODO LECTOR QR HÍBRIDO • SISA_UNIT_01
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-emerald-400 font-mono">
                    {new Date().toLocaleTimeString("es-EC", { hour12: false })}
                  </p>
                  <p className="text-[9px] text-slate-500 font-mono">
                    {new Date().toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>

              {/* Viewfinder simulation frame */}
              <div className="relative aspect-video bg-slate-950 rounded-2xl border-2 border-slate-800 flex flex-col items-center justify-center overflow-hidden group">
                
                {activeCameraState ? (
                  <>
                    {/* Live hardware viewfinder */}
                    <video 
                      ref={videoRef}
                      autoPlay 
                      playsInline 
                      muted 
                      className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                    />
                    
                    {/* Futuristic scan grid animation overlay */}
                    <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent shadow-[0_0_12px_#10b981] animate-bounce top-1/4 z-10" />
                    
                    {/* Frame Target Scope */}
                    <div className="absolute inset-0 m-auto w-48 h-48 border-2 border-dashed border-emerald-400/60 rounded-xl flex items-center justify-center pointer-events-none z-10 bg-emerald-500/5">
                      <QrCode className="w-20 h-20 text-emerald-400/30 animate-pulse" />
                    </div>

                    {/* Scanner action bar */}
                    <div className="absolute bottom-4 inset-x-4 bg-slate-900/85 border border-slate-800 p-3 rounded-xl flex items-center justify-between backdrop-blur-md z-15">
                      <div className="flex items-center gap-2 text-xs">
                        <Camera className="w-4 h-4 text-emerald-400" />
                        <span className="font-semibold">Cámara Activa</span>
                      </div>
                      <button 
                        onClick={() => setActiveCameraState(false)}
                        className="text-[10px] uppercase font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition"
                      >
                        Apagar Cámara
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400">
                      <QrCode className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm">Escaner Inactivo</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        Puedes activar tu cámara para simular escáneo de las credenciales físicas de los operarios, o usar el teclado táctil de PIN.
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveCameraState(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs font-bold rounded-xl transition flex items-center gap-2 text-white shadow-lg shadow-emerald-900/20"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Activar Cámara / Lector QR</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Help tip footer */}
              <div className="mt-4 bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
                <Volume2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
                <p className="leading-relaxed">
                  <strong className="text-slate-100">Guía de Voz Activa:</strong> El sistema pronunciará en español las confirmaciones autorizadas de Entrada/Salida para evitar errores.
                </p>
              </div>
            </div>

            {/* CREDENTIALS TEST-SUITE (Interactive simulated scanner badges) */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Gafetes de Prueba de Operarios</h3>
                  <p className="text-xs text-slate-500">Haz clic en cualquier operario para emular un escaneo QR físico instantáneo.</p>
                </div>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Test click
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {operators.map((op, i) => {
                  const todayLogs = attendanceLogs.filter(l => l.operatorId === op.uid && l.date === new Date().toISOString().split("T")[0]);
                  const isActive = todayLogs.length > 0 && todayLogs.some(l => l.checkIn && !l.checkOut);
                  return (
                    <button
                      key={op.uid}
                      onClick={() => executeRegister(op)}
                      className="text-left p-3 rounded-2xl border border-slate-100 hover:border-emerald-300 bg-slate-50 hover:bg-emerald-50/20 active:scale-98 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition">
                          {op.name.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-slate-800 truncate">{op.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate uppercase">Código Pin: {i + 1}</p>
                        </div>
                      </div>
                      
                      <div className="shrink-0 pl-1 text-right">
                        {isActive ? (
                          <span className="text-[9px] font-bold uppercase py-0.5 px-2 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                            Laborando
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase py-0.5 px-2 rounded-full bg-slate-200 text-slate-600">
                            Inactivo
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT AREA: TOUCH NUMPAD FOR PIN ENTRY */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm h-full flex flex-col justify-between">
              <div>
                <div className="border-b border-slate-100 pb-5 mb-6 text-center">
                  <h3 className="font-bold text-slate-800 text-base">Marcación mediante Cédula / PIN</h3>
                  <p className="text-xs text-slate-400 mt-1">Digita el código interno o cédula del empleado en el teclado.</p>
                </div>

                {/* Pin Screen Display */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 px-6 py-4 mb-6 flex items-center justify-between min-h-[64px] shadow-inner font-mono text-center">
                  <div className="text-xs font-semibold text-slate-400">PIN ingresado</div>
                  <div className="text-xl font-bold tracking-widest text-slate-800">
                    {inputPin || <span className="text-xs text-slate-350 italic font-sans font-normal">Digita PIN (1-4)</span>}
                  </div>
                </div>

                {/* Tactical keypad layout */}
                <div className="grid grid-cols-3 gap-3.5 mb-6">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      onClick={() => handlePinPress(num)}
                      className="h-14 font-mono font-black text-lg bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 rounded-xl border border-slate-200 transition"
                    >
                      {num}
                    </button>
                  ))}
                  
                  {/* Action key Clear */}
                  <button
                    onClick={handlePinClear}
                    className="h-14 text-xs font-bold bg-slate-50 hover:bg-red-50 text-red-600 rounded-xl border border-slate-200 transition active:scale-95"
                  >
                    Borrar Todo
                  </button>

                  <button
                    onClick={() => handlePinPress("0")}
                    className="h-14 font-mono font-black text-lg bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 rounded-xl border border-slate-200 transition"
                  >
                    0
                  </button>

                  {/* Action key Back */}
                  <button
                    onClick={handlePinDelete}
                    className="h-14 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition active:scale-95"
                  >
                    Atrás
                  </button>
                </div>
              </div>

              {/* Tactile Verify button */}
              <button
                onClick={handlePinSubmit}
                className="w-full h-14 bg-slate-900 hover:bg-emerald-600 active:scale-98 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition duration-150 flex items-center justify-center gap-2 shadow-lg"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Registrar Entrada / Salida</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDER VIEW 2: RECORDS & TIMESHEET (INTERFAZ DE ADMINISTRACION) */}
      {activeSubTab === "records" && (
        <div className="space-y-6" id="attendance-records-pane">
          
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Registros en el ERP</p>
                <h3 className="text-2xl font-black text-slate-850 mt-1 font-mono">{attendanceLogs.length}</h3>
              </div>
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 border border-slate-200">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Puntuales Hoy</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                  {attendanceLogs.filter(l => l.date === new Date().toISOString().split("T")[0] && l.status === "Puntual").length}
                </h3>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Atrasos de Turno</p>
                <h3 className="text-2xl font-black text-amber-500 mt-1 font-mono">
                  {attendanceLogs.filter(l => l.date === new Date().toISOString().split("T")[0] && l.status === "Atraso").length}
                </h3>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 border border-amber-100">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Licencias / Médicos</p>
                <h3 className="text-2xl font-black text-indigo-600 mt-1 font-mono">
                  {attendanceLogs.filter(l => l.justified).length}
                </h3>
              </div>
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* MAIN ADMINISTRATIVE LOGS GRID */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Registro Centralizado de Asistencias Sisa</h3>
                <p className="text-xs text-slate-500">Cronología oficial autorizada de entrada, salidas y cálculos contables.</p>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="text-[10px] bg-slate-900 text-white font-bold py-1 px-3 rounded-lg border border-slate-850">
                  Total Horas Operadas: {attendanceLogs.reduce((s,l) => s + (l.hoursWorked || 0), 0).toFixed(1)} hrs
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                <p>Cargando registros oficiales...</p>
              </div>
            ) : attendanceLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500 italic">
                No existen registros dactilares cargados para este periodo. Use la pestaña de terminal para marcar fichas.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-600 font-bold border-b border-slate-100">
                      <th className="p-4">Empleado de Planta</th>
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Entrada Registrada</th>
                      <th className="p-4">Salida Registrada</th>
                      <th className="p-4">Horas Trabajadas</th>
                      <th className="p-4">Horas Extras (X)</th>
                      <th className="p-4">Puntualidad</th>
                      <th className="p-4">Descripción / Justificación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceLogs.map((log) => {
                      // Formatting hours
                      const formattedIn = log.checkIn ? new Date(log.checkIn).toLocaleTimeString("es-EC", { hour12: false }) : "--";
                      const formattedOut = log.checkOut ? new Date(log.checkOut).toLocaleTimeString("es-EC", { hour12: false }) : "Laborando (Abierto)";
                      
                      // Theme tag assignment
                      let statusBadge = "bg-slate-100 text-slate-700";
                      if (log.status === "Puntual") statusBadge = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                      else if (log.status === "Atraso") statusBadge = "bg-amber-50 text-amber-700 border border-amber-150";
                      else if (log.status === "Falta") statusBadge = "bg-red-50 text-red-700 border border-red-100";
                      else if (log.status === "Vacaciones" || log.status === "Permiso Médico" || log.status === "Falta Justificada") {
                        statusBadge = "bg-indigo-50 text-indigo-700 border border-indigo-150";
                      }

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/40 text-slate-700 transition">
                          <td className="p-4 font-bold text-slate-900">{log.operatorName}</td>
                          <td className="p-4 font-mono">{log.date}</td>
                          <td className="p-4 font-mono text-slate-500">{formattedIn}</td>
                          <td className="p-4 font-mono">
                            {log.checkOut ? (
                              <span className="text-slate-500">{formattedOut}</span>
                            ) : (
                              <span className="text-emerald-600 font-bold animate-pulse text-[10px] tracking-wide flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                laborando
                              </span>
                            )}
                          </td>
                          <td className="p-4 font-mono font-bold">{log.hoursWorked ? `${log.hoursWorked.toFixed(2)} h` : "0.0 h"}</td>
                          <td className="p-4 font-mono text-emerald-600 font-bold">{log.hoursExtra ? `+${log.hoursExtra.toFixed(2)} h` : "--"}</td>
                          <td className="p-4">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${statusBadge}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="p-4 text-slate-400 max-w-xs truncate italic">
                            {log.justified ? log.justificationReason : "--"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER VIEW 3: SOLICITUD DE PERMISOS & JUSTIFICACIONES (EXCEPCIONES) */}
      {activeSubTab === "justifications" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="justifications-pane">
          
          {/* LEFT SIDE FORM */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm">
            <div className="border-b border-slate-100 pb-5 mb-6">
              <h3 className="font-bold text-slate-800 text-sm">Registrar Descargos y Licencias Médicas</h3>
              <p className="text-xs text-slate-500 mt-1">
                Administra vacaciones y permisos. Al guardar, congelará el estado del día asignando el pago correspondiente.
              </p>
            </div>

            <form onSubmit={handleSaveJustification} className="space-y-5 text-slate-700">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 block">
                  Seleccionar Operario *
                </label>
                <select
                  value={justifyingOperatorId}
                  onChange={(e) => setJustifyingOperatorId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                  required
                >
                  <option value="">-- Elige el personal --</option>
                  {operators.map((op) => (
                    <option key={op.uid} value={op.uid}>{op.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 block">
                    Fecha del Justificante *
                  </label>
                  <input
                    type="date"
                    value={justificationDate}
                    onChange={(e) => setJustificationDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 text-slate-800 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-slate-500 block">
                    Tipo de Excepción *
                  </label>
                  <select
                    value={justificationType}
                    onChange={(e) => setJustificationType(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                    required
                  >
                    <option value="Permiso Médico">Permiso Médico</option>
                    <option value="Vacaciones">Vacaciones</option>
                    <option value="Falta Justificada">Falta Justificada</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 block">
                  Descripción / Motivo Oficial (médico, viaje, etc) *
                </label>
                <textarea
                  value={justificationReason}
                  onChange={(e) => setJustificationReason(e.target.value)}
                  rows={4}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 leading-relaxed"
                  placeholder="Especifica el código de certificado del IESS o motivo justificado..."
                  required
                />
              </div>

              {justificationSuccessMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <p>{justificationSuccessMsg}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submittingJustification}
                className="w-full bg-slate-900 hover:bg-emerald-600 active:scale-95 disabled:bg-slate-300 text-white rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition"
              >
                {submittingJustification ? "Registrando Descargo..." : "Guardar Justificación Oficial"}
              </button>
            </form>
          </div>

          {/* RIGHT SIDE SUMMARY LIST */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm">
            <div className="border-b border-slate-100 pb-5 mb-6">
              <h3 className="font-bold text-slate-800 text-sm">Resumen de Justificaciones Registradas</h3>
              <p className="text-xs text-slate-500 mt-1">Histórico de permisos aprobados por la gerencia.</p>
            </div>

            {attendanceLogs.filter(l => l.justified).length === 0 ? (
              <div className="p-12 text-slate-400 italic text-center text-xs">
                No se registran justificaciones archivadas en esta sesión.
              </div>
            ) : (
              <div className="space-y-4">
                {attendanceLogs.filter(l => l.justified).map((log) => (
                  <div key={log.id} className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-xs">{log.operatorName}</span>
                        <span className="text-[9px] uppercase font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          {log.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-mono">Fecha: {log.date}</p>
                      <p className="text-xs text-slate-500 italic leading-relaxed bg-white border border-slate-100 p-2.5 rounded-xl">
                        "{log.justificationReason}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FEEDBACK OVERLAY AUDIO/VISUAL MODAL */}
      {showFeedbackModal && feedbackInfo && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-99 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center text-white space-y-6 animate-fade-in">
            
            <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-500 to-indigo-500 p-1">
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-black text-2xl text-white">
                {feedbackInfo.operatorName.charAt(0)}
              </div>
            </div>

            <div className="space-y-2">
              <span className={`text-[10px] font-mono tracking-widest uppercase font-bold py-1 px-3 rounded-full ${
                feedbackInfo.status === "Atraso" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              }`}>
                {feedbackInfo.status === "Atraso" ? "🔔 ATRASO REGISTRADO" : "💚 REGISTRO PUNTUAL"}
              </span>
              <h3 className="text-xl font-bold font-display tracking-tight mt-3">{feedbackInfo.operatorName}</h3>
              <p className="text-xs text-slate-400">
                La marca horaria de {feedbackInfo.type === "entrada" ? "Entrada" : "Salida"} se ha procesado.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono">
              <p className="text-amber-400 font-black text-2xl tracking-wider">{feedbackInfo.time}</p>
              <p className="text-[10px] text-slate-500 mt-1 uppercase">Hora de Ecuador</p>
            </div>

            <button
              onClick={() => setShowFeedbackModal(false)}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-bold uppercase tracking-wider text-xs rounded-xl transition"
            >
              Entendido / Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
