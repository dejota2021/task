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

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const port = process.env.PORT || 3000;

  app.use(express.json());

  // API endpoint for voice-control action interpretation
  app.post('/api/ai/voice-control', async (req, res) => {
    try {
      const { text, existingSheets, existingColumns } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'El comando de voz no puede estar vacío.' });
      }

      const sheetsList = Array.isArray(existingSheets) ? existingSheets : [];
      const columnsList = Array.isArray(existingColumns) ? existingColumns : [];

      const systemInstruction = `
You are the advanced AI Voice Control interpreter for TaskPro 3D, a real-time Kanban board system.
Your job is to read Spanish transcribed text from the microphone and translate it into clear state-action operations.

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
- Users speak naturally: "Agrega las tareas comprar pan, comprar queso e ir a la tienda." You must parse the list and split it into three items: ["comprar pan", "comprar queso", "ir a la tienda"].
- Notice connectors: "y", "e", "además de", "también", commas, pauses. Be aggressive and smart in isolating individual task titles so the user can easily say 5 things in one breath and get them all added cleanly!
- If the user says: "borrar las tareas comprar pan y comprar leche", add action "delete_tasks" with titles: ["comprar pan", "comprar leche"].
- Matching Sheets: Fuzzily match Spanish board/sheet requests. If they say "cambiar a proyectos" and there's a sheet "Proyectos 🚀", map to switch_sheet with sheetId "sheet_..." of that sheet.
- Spanish speech connectors: Convert vocal intents like "por favor agrégate...", "ponme...", "borra...", "sácame...", "crea una hoja que se llame..." to the correct clean actions.

Always include a friendly, concise, and smart auditory confirmation feedback in "speechFeedback" in Spanish, e.g. "¡Por supuesto! Creé la hoja de Proyectos y agregué las tareas: comprar café y llamar a Juan."
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
      return res.json(parsedData);
    } catch (err: any) {
      console.error('AI Voice Control error:', err);
      return res.status(500).json({ error: err.message || 'Error interpretando el comando de voz.' });
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

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
