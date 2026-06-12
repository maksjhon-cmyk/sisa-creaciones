import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

// Load environment variables
dotenv.config();

// Shared Gemini server initialization with lazy loading to prevent crashes if GEMINI_API_KEY is missing/blank at startup
let aiInstance: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("La variable de entorno GEMINI_API_KEY no está configurada o se encuentra vacía. Por favor ingrésela en los Ajustes del panel.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsing configuration to support high-res base64 invoice image payloads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API 1: Health status ping
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API 2: Invoice OCR processing using Google Gen AI SDK
  app.post("/api/ocr/invoice", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: "Falta el payload de la imagen ('imageBase64') o el tipo MIME ('mimeType')." });
        return;
      }

      // Slice out the base64 header if it was passed with the standard data url prefix
      let rawBase64 = imageBase64;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }

      const promptText = `
        Analiza detalladamente esta imagen de factura comercial (Ecuador) y extrae de forma estructurada los siguientes datos:
        1. Información del Proveedor (Nombre comercial, RUC chileno/ecuatoriano, teléfono, email, dirección).
        2. Detalles de la compra de materia prima (Número de factura en formato AAA-BBB-CCCCCCCCC, fecha contable formateada YYYY-MM-DD, descripción, cantidad, precio unitario sin IVA, subtotal cobrado, IVA cobrado, total general facturado).
        3. Clasificación contable ecuatoriana de partida doble recomendada (cuenta de débito 1.2 "Inventario de Materia Prima" y cuenta de crédito 1.1 "Caja" si está pagada ó 2.1 "Cuentas por pagar" si es a crédito/pendiente).
      `;

      // Set up the structured response schema matching the database models defined in Types.ts
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          supplier: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: "Razón social o nombre comercial limpio del emisor/proveedor.",
              },
              ruc: {
                type: Type.STRING,
                description: "RUC de 13 dígitos o cédula del proveedor. Limpio de espacios y guiones.",
              },
              phone: {
                type: Type.STRING,
                description: "Teléfono de contacto o celuar del proveedor, o string vacío si no se detecta.",
              },
              email: {
                type: Type.STRING,
                description: "Correo electrónico del emisor, o string vacío si no se detecta.",
              },
              address: {
                type: Type.STRING,
                description: "Dirección física de la sucursal o matriz, o string vacío si no se detecta.",
              },
            },
            required: ["name", "ruc", "phone", "email", "address"],
          },
          purchase: {
            type: Type.OBJECT,
            properties: {
              invoiceNumber: {
                type: Type.STRING,
                description: "Número de factura completo. Formato estándar ecuatoriano (ej: 001-002-000021345) o el correlativo numérico si no se encuentra.",
              },
              date: {
                type: Type.STRING,
                description: "Fecha de emisión de la factura, estrictamente formateada como YYYY-MM-DD. E.g. 2026-06-05.",
              },
              materialSuggestedName: {
                type: Type.STRING,
                description: "Descripción resumida pero descriptiva de la mercadería o insumo adquirido (e.g. 'Tela Dením Elástica', 'Hilo Poliéster de cono').",
              },
              quantity: {
                type: Type.NUMBER,
                description: "La cantidad comprada de dicho insumo o suma de ítems para el registro.",
              },
              unitPrice: {
                type: Type.NUMBER,
                description: "El costo unitario neto sin impuestos de la materia prima.",
              },
              subtotal: {
                type: Type.NUMBER,
                description: "Subtotal facturado antes de impuestos (Base imponible).",
              },
              iva: {
                type: Type.NUMBER,
                description: "Valor neto del IVA facturado (habitualmente 15% del subtotal en Ecuador, o 0% si aplica tarifa cero).",
              },
              total: {
                type: Type.NUMBER,
                description: "Total general a pagar (subtotal + iva - descuento).",
              },
            },
            required: [
              "invoiceNumber",
              "date",
              "materialSuggestedName",
              "quantity",
              "unitPrice",
              "subtotal",
              "iva",
              "total",
            ],
          },
          accounting: {
            type: Type.OBJECT,
            properties: {
              debitAccount: {
                type: Type.STRING,
                description: "Código de cuenta contable sugerida para el Débito (Defecto: '1.2' para Inventario de Materia Prima).",
              },
              creditAccount: {
                type: Type.STRING,
                description: "Código de cuenta contable sugerida para el Crédito ('1.1' para dinero/Caja, o '2.1' para Pasivo/Proveedores si está pendiente).",
              },
              reasoning: {
                type: Type.STRING,
                description: "Explicación breve de la transacción en español con base contable.",
              },
            },
            required: ["debitAccount", "creditAccount", "reasoning"],
          },
        },
        required: ["supplier", "purchase", "accounting"],
      };

      const imagePart = {
        inlineData: {
          mimeType,
          data: rawBase64,
        },
      };

      const textPart = {
        text: promptText,
      };

      // Call Gemini 3.5 Flash for fast, secure, and accurate billing OCR extraction
      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const resultText = response.text || "{}";
      const parsedData = JSON.parse(resultText.trim());

      res.json(parsedData);
    } catch (err: any) {
      console.error("Error durring invoice OCR billing processing:", err);
      res.status(500).json({ error: "Error interno al procesar la factura con inteligencia artificial: " + err.message });
    }
  });

  // API 3: Production Order AI OCR parsing using Google Gen AI SDK
  app.post("/api/ocr/production-order", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: "Falta el payload de la imagen ('imageBase64') o el tipo MIME ('mimeType')." });
        return;
      }

      // Slice out the base64 header if it was passed with the standard data url prefix
      let rawBase64 = imageBase64;
      if (rawBase64.includes(",")) {
        rawBase64 = rawBase64.split(",")[1];
      }

      const promptText = `
        Realiza un análisis jerárquico y secuencial estricto de esta imagen de pedido textil de "Sisa Creaciones":
        
        PRIMERO - Identificación de Prenda: Analiza los campos y valores de medidas presentes para identificar automáticamente el tipo de prenda confeccionado. Debe registrarse estrictamente como una de las siguientes tres categorías: "Blusa", "Pollera" o "Faja". Si se detecta medidas de espalda/busto/manga/brazo, se trata de una "Blusa". Si se detecta ancho de pollera o AP, se trata de una "Pollera". Si se detecta faja, se trata de una "Faja".
        
        SEGUNDO - Medidas Numéricas: Mapea e inyecta los valores numéricos de medidas correspondientes para los recuadros activos de confección (sin incluir el sufijo 'cm', solo el número decimal o entero).
        
        TERCERO - Datos Financieros y Cliente: Extrae obligatoriamente la información del cliente y los siguientes datos financieros clave:
          - clientName: Nombre completo del Cliente (búscalo en las firmas, títulos o encabezados).
          - clientPhone: Número de teléfono celular o convencional del cliente.
          - clientIdNumber: Número de Cédula o RUC del cliente (búscalo si se indica expresamente, e.g. 'CC', 'RUC', 'Cód. Identidad', 'C.I. #', o un número de 10 ó 13 dígitos).
          - clientAddress: Dirección domiciliaria o de entrega del cliente.
          - valorPrenda: Costo/Valor total cobrado por la prenda.
          - anticipo: Valor del Anticipo o abono ya pagado por el cliente.
          - saldo: Saldo restante pendiente de cobro (calculado como Valor Prenda menos Anticipo).
          
        Nota: Si algún dato opcional o financiero no está explícito, pon 0 para números o "" para textos.
      `;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          garmentType: { type: Type.STRING, description: "Tipo de prenda identificado jerárquicamente. Debe ser estrictamente uno de: 'Blusa', 'Pollera', 'Faja'." },
          color: { type: Type.STRING, description: "Color de la prenda / color colorante de base." },
          notes: { type: Type.STRING, description: "Observaciones de costura, detalles del bordado o notas generales." },
          modalidad: { type: Type.STRING, description: "Modalidad: 'Medidas' o 'Talla'." },
          tallaBlusa: { type: Type.STRING, description: "Talla sugerida de blusa: e.g. S, M, L, XL, XXL o vacío." },
          tallaAnaco: { type: Type.STRING, description: "Talla sugerida de anaco: e.g. 28, 30, 32, 34, 36, 38, 40 o vacío." },
          anchoEspalda: { type: Type.NUMBER, description: "Ancho Espalda en cm. Coloca 0 si no se detecta." },
          talleEspalda: { type: Type.NUMBER, description: "Talle Espalda en cm. Coloca 0 si no se detecta." },
          contornoBusto: { type: Type.NUMBER, description: "Contorno Busto en cm. Coloca 0 si no se detecta." },
          contornoCintura: { type: Type.NUMBER, description: "Contorno Cintura en cm. Coloca 0 si no se detecta." },
          contornoCadera: { type: Type.NUMBER, description: "Contorno Cadera en cm. Coloca 0 si no se detecta." },
          largoManga: { type: Type.NUMBER, description: "Largo Manga en cm. Coloca 0 si no se detecta." },
          largoTotalBlusa: { type: Type.NUMBER, description: "Largo total blusa en cm. Coloca 0 si no se detecta." },
          puno: { type: Type.NUMBER, description: "Puño en cm. Coloca 0 si no se detecta." },
          pinza: { type: Type.NUMBER, description: "Pinza en cm. Coloca 0 si no se detecta." },
          brazo: { type: Type.NUMBER, description: "Brazo en cm. Coloca 0 si no se detecta." },
          colorBlusa: { type: Type.STRING, description: "Color de la blusa en texto. Vacío si no se detecta." },
          anchoPollera: { type: Type.NUMBER, description: "Ancho Pollera en cm. Coloca 0 si no se detecta." },
          faja: { type: Type.NUMBER, description: "Faja en cm. Coloca 0 si no se detecta." },
          dejaTelaBlusa: { type: Type.BOOLEAN, description: "true si el cliente provee la tela de la blusa, de lo contrario false." },
          dejaTelaPollera: { type: Type.BOOLEAN, description: "true si el cliente provee la tela de la pollera, de lo contrario false." },
          dejaTelaFaja: { type: Type.BOOLEAN, description: "true si el cliente provee la tela de la faja, de lo contrario false." },
          clientName: { type: Type.STRING, description: "Nombre completo del cliente. Por defecto vacío." },
          clientPhone: { type: Type.STRING, description: "Teléfono del cliente. Por defecto vacío." },
          clientIdNumber: { type: Type.STRING, description: "Número de cédula o RUC del cliente. Por defecto vacío." },
          clientAddress: { type: Type.STRING, description: "Dirección de domicilio o entrega. Por defecto vacío." },
          valorPrenda: { type: Type.NUMBER, description: "Valor Total de la Prenda en USD. Por defecto 0." },
          anticipo: { type: Type.NUMBER, description: "Anticipo pagado en USD. Por defecto 0." },
          saldo: { type: Type.NUMBER, description: "Saldo restante pendiente de cobro en USD. Por defecto 0." },
        },
        required: [
          "garmentType",
          "color",
          "notes",
          "modalidad",
          "tallaBlusa",
          "tallaAnaco",
          "anchoEspalda",
          "talleEspalda",
          "contornoBusto",
          "contornoCintura",
          "contornoCadera",
          "largoManga",
          "largoTotalBlusa",
          "puno",
          "pinza",
          "brazo",
          "colorBlusa",
          "anchoPollera",
          "faja",
          "dejaTelaBlusa",
          "dejaTelaPollera",
          "dejaTelaFaja",
          "clientName",
          "clientPhone",
          "clientIdNumber",
          "clientAddress",
          "valorPrenda",
          "anticipo",
          "saldo",
        ],
      };

      const imagePart = {
        inlineData: {
          mimeType,
          data: rawBase64,
        },
      };

      const textPart = {
        text: promptText,
      };

      // Call Gemini 3.5 Flash for image reasoning and fast response
      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const resultText = response.text || "{}";
      const parsedData = JSON.parse(resultText.trim());

      res.json(parsedData);
    } catch (err: any) {
      console.error("Error during production order OCR processing:", err);
      res.status(500).json({ error: "Error interno al procesar el pedido con inteligencia artificial: " + err.message });
    }
  });

  // Robust and resilient environment / directory detection
  // In both dev (npm run dev) and prod (npm start), process.cwd() is always the parent of "dist" (/app)
  const distPath = path.join(process.cwd(), "dist");
  const hasDist = fs.existsSync(path.join(distPath, "index.html"));

  // Serve in production mode if NODE_ENV is production, or if we are running in production mode, or if the TS source server.ts is absent
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV_MODE === "production" ||
    !fs.existsSync(path.join(process.cwd(), "server.ts"));

  console.log(`[Runtime Server] Env detection: NODE_ENV=${process.env.NODE_ENV}, distPath=${distPath}, hasDist=${hasDist}, isProduction=${isProduction}`);

  if (!isProduction) {
    // Development server mode (integrate Express with Vite dev middleware)
    console.log("[Runtime Server] Starting in DEVELOPMENT mode with Vite dev middleware...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (viteImportError: any) {
      console.warn("[Runtime Server] Warning: Could not load Vite dev middleware. Falling back to serving static files from /dist.", viteImportError);
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  } else {
    // Production statics delivery deployment mode
    console.log(`[Runtime Server] Starting in PRODUCTION mode serving static files from ${distPath}...`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ERP full-stack server running successfully on port ${PORT}`);
  });
}

startServer();
