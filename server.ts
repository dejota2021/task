import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Google Gen AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Rule-based fallback parser for high-speed, 100% resilient Spanish voice recognition
function parseVoiceCommandFallback(text: string, sheets: any[], columns: any[]) {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const actions: any[] = [];
  let speechFeedback = '';

  // 1. Toggle sounds
  if (lower.includes('desactivar sonido') || lower.includes('quitar sonido') || lower.includes('silenciar')) {
    actions.push({ type: 'toggle_sound', enabled: false });
    return { actions, speechFeedback: 'Sonidos desactivados.' };
  }
  if (lower.includes('activar sonido') || lower.includes('poner sonido') || lower.includes('con sonido')) {
    actions.push({ type: 'toggle_sound', enabled: true });
    return { actions, speechFeedback: 'Sonidos activados.' };
  }

  // 2. Create sheet
  const sheetCreateMatch = lower.match(/(?:crear|crea|nueva|nuevo)\s+(?:hoja|tablero|pizarra)\s+([a-záéíóúñ0-9\s]+?)(?:\s+y\s+(?:agregar|crear|pon)|\s*$)/i);
  if (sheetCreateMatch && sheetCreateMatch[1]) {
    const sheetTitle = sheetCreateMatch[1].trim();
    if (sheetTitle) {
      actions.push({
        type: 'create_sheet',
        title: sheetTitle.charAt(0).toUpperCase() + sheetTitle.slice(1),
        emoji: '🎯'
      });
      speechFeedback = `Creé la hoja "${sheetTitle}".`;
    }
  }

  // 3. Delete tasks
  const deleteMatch = lower.match(/(?:eliminar|borrar|quitar|sacar)\s+(?:tarea|tareas|pendiente|pendientes)?\s*(.+)/i);
  if (deleteMatch && deleteMatch[1] && !lower.includes('crear hoja')) {
    const rawItems = deleteMatch[1].trim();
    const titles = rawItems
      .split(/\s+y\s+|\s+e\s+|,\s*/i)
      .map(t => t.replace(/^(?:la|el|las|los|de|mi)\s+/i, '').trim())
      .filter(t => t.length > 0);

    if (titles.length > 0) {
      actions.push({ type: 'delete_tasks', titles });
      return {
        actions,
        speechFeedback: `Eliminé ${titles.length === 1 ? `el pendiente "${titles[0]}"` : `${titles.length} pendientes`}.`
      };
    }
  }

  // 4. Add tasks (e.g. "agregar pendiente la suco del cielo", "agregar tareas comprar pan y comprar leche")
  let addTaskContent = '';
  const addMatch = lower.match(/(?:agregar|agrega|añadir|añade|crear|crea|anotar|anota|nuevo|nueva|pon|poner)\s+(?:pendiente|pendientes|tarea|tareas)?\s*(.+)/i);
  if (addMatch && addMatch[1]) {
    addTaskContent = addMatch[1];
  } else if (!sheetCreateMatch && clean.length > 1) {
    addTaskContent = clean;
  }

  if (addTaskContent) {
    let cleaned = addTaskContent.replace(/^(?:que|para|de|a|en)\s+/i, '').trim();
    const titles = cleaned
      .split(/\s+y\s+|\s+e\s+|,\s*/i)
      .map(t => t.trim())
      .filter(t => t.length > 0 && !['las', 'los', 'la', 'el', 'tareas', 'pendientes'].includes(t.toLowerCase()));

    if (titles.length > 0) {
      actions.push({ type: 'add_tasks', titles });
      const feedback = actions.some(a => a.type === 'create_sheet')
        ? `${speechFeedback} Y agregué ${titles.length === 1 ? `el pendiente: "${titles[0]}"` : `${titles.length} pendientes`}.`
        : `¡Listo! Agregué ${titles.length === 1 ? `el pendiente "${titles[0]}"` : `${titles.length} pendientes`}.`;
      return { actions, speechFeedback: feedback };
    }
  }

  // 5. Switch sheet
  const switchMatch = lower.match(/(?:cambiar|cambia|ir|abrir|abre|pasa|pasar)\s+(?:a|a la|al)?\s*(?:hoja|tablero)?\s*(.+)/i);
  if (switchMatch && switchMatch[1]) {
    const target = switchMatch[1].trim();
    const matchedSheet = sheets.find(s => 
      s.title && (s.title.toLowerCase().includes(target) || target.includes(s.title.toLowerCase()))
    );
    if (matchedSheet) {
      actions.push({
        type: 'switch_sheet',
        sheetId: matchedSheet.id,
        title: matchedSheet.title
      });
      return { actions, speechFeedback: `Cambiando a la hoja "${matchedSheet.title}".` };
    }
  }

  if (actions.length === 0) {
    actions.push({ type: 'add_tasks', titles: [clean] });
    speechFeedback = `Agregué el pendiente: "${clean}".`;
  }

  return { actions, speechFeedback };
}

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const port = process.env.PORT || 3000;

  app.use(express.json());

  // API endpoint for voice-control action interpretation
  app.post('/api/ai/voice-control', async (req, res) => {
    const { text, existingSheets, existingColumns } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'El comando de voz no puede estar vacío.' });
    }

    const sheetsList = Array.isArray(existingSheets) ? existingSheets : [];
    const columnsList = Array.isArray(existingColumns) ? existingColumns : [];

    // If no API key or in fallback mode, run the instant semantic parser
    if (!process.env.GEMINI_API_KEY) {
      const fallbackResult = parseVoiceCommandFallback(text, sheetsList, columnsList);
      return res.json(fallbackResult);
    }

    try {
      const systemInstruction = `
You are the advanced AI Voice Control interpreter for TaskPro 3D, a real-time Kanban board system.
Your job is to listen intently, understand the nuanced user intent from Spanish transcribed text, and translate it into clear, precise state-action operations.

Current Board State Context:
- Available Sheets/Boards: ${JSON.stringify(sheetsList.map(s => ({ id: s.id, title: s.title, emoji: s.emoji })))}
- Column lists in active view: ${JSON.stringify(columnsList.map(c => ({ id: c.id, title: c.title })))}

Supported Actions:
1. "create_sheet": Title (string) and emoji (defaulting to appropriate ones like 🎯, 🚀, 💻, 🏠).
2. "add_tasks": An array "titles" (string[]) of multiple new tasks to create (defaults to first column).
3. "delete_tasks": An array "titles" (string[]) of card titles to match and remove.
4. "switch_sheet": Target board "sheetId" or "title" to open.
5. "toggle_sound": Enabled (boolean) to turn sound effects on or off.

Fuzzy Interpretation Rules for high-fidelity Spanish transcription:
- Users speak naturally: "Agregar pendiente la suco del cielo" -> action "add_tasks" with titles: ["la suco del cielo"].
- "Agrega las tareas comprar pan, comprar queso e ir a la tienda" -> action "add_tasks" with titles: ["comprar pan", "comprar queso", "ir a la tienda"].
- "borrar las tareas comprar pan y comprar leche" -> action "delete_tasks" with titles: ["comprar pan", "comprar leche"].
- "cambiar a proyectos" -> switch_sheet to matching sheet.
- Spanish speech connectors: Convert vocal intents like "por favor agrégate...", "ponme...", "borra...", "sácame...", "crea una hoja que se llame..." to the correct clean actions.

Always include a friendly, concise, and smart auditory confirmation feedback in "speechFeedback" in Spanish, e.g. "¡Listo! Agregué el pendiente: la suco del cielo."
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Spoken command: "${text}"`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              actions: {
                type: Type.ARRAY,
                description: 'The list of executable board actions interpreted from the user\'s request.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      description: 'The action type: "create_sheet", "add_tasks", "delete_tasks", "switch_sheet", or "toggle_sound".',
                    },
                    title: {
                      type: Type.STRING,
                      description: 'The sheet title or target sheet title (for create_sheet or switch_sheet).',
                    },
                    emoji: {
                      type: Type.STRING,
                      description: 'The sheet emoji icon (for create_sheet).',
                    },
                    sheetId: {
                      type: Type.STRING,
                      description: 'The target sheet ID to switch to (for switch_sheet, if matching an existing sheet).',
                    },
                    titles: {
                      type: Type.ARRAY,
                      description: 'Array of task titles to add or delete (for add_tasks or delete_tasks).',
                      items: {
                        type: Type.STRING,
                      }
                    },
                    enabled: {
                      type: Type.BOOLEAN,
                      description: 'Sound settings state (for toggle_sound).',
                    }
                  },
                  required: ['type']
                }
              },
              speechFeedback: {
                type: Type.STRING,
                description: 'Friendly spoken confirmation in Spanish.',
              }
            },
            required: ['actions', 'speechFeedback']
          }
        }
      });

      const responseText = response.text || '{}';
      const parsedData = JSON.parse(responseText.trim());
      if (parsedData.actions && parsedData.actions.length > 0) {
        return res.json(parsedData);
      }

      // If Gemini returned empty actions, fall back to semantic parser
      const fallbackResult = parseVoiceCommandFallback(text, sheetsList, columnsList);
      return res.json(fallbackResult);
    } catch (err: any) {
      console.warn('AI Voice Control error, executing semantic fallback:', err);
      const fallbackResult = parseVoiceCommandFallback(text, sheetsList, columnsList);
      return res.json(fallbackResult);
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
