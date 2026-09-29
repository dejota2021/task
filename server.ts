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
You are the AI Voice Control interpreter for TaskPro 3D.
Your objective is to convert transcribed Spanish speech commands into clean, actionable Kanban state changes.

Here is the current state of the board:
- Active sheets/boards list: ${JSON.stringify(sheetsList.map(s => ({ id: s.id, title: s.title, emoji: s.emoji })))}
- Current columns in active board: ${JSON.stringify(columnsList.map(c => ({ id: c.id, title: c.title })))}

You can batch multiple actions together in a single request.
Allowed action types in "actions":
1. "create_sheet": Create a new board sheet. Requires "title" (string) and appropriate "emoji" (string, e.g. 🎯, 🚀, 💡).
2. "add_tasks": Add multiple new pending task cards. Requires an array of task titles in "titles".
3. "delete_tasks": Delete/remove several task cards. Requires an array of matching task titles in "titles".
4. "switch_sheet": Switch current view to a different existing sheet. Requires either a matching "sheetId" or "title".
5. "toggle_sound": Enable or disable board sound effects. Requires a "enabled" (boolean).

Be helpful and smart:
- If they ask: "crear hoja proyectos y agregar las tareas comprar cafe y llamar a juan", return TWO actions (1: create_sheet, 2: add_tasks).
- Provide a brief, conversational, and friendly Spanish spoken audio feedback sentence in "speechFeedback" (e.g. "¡Listo! Creé la hoja Proyectos y agregué las dos tareas."). Keep it concise and natural.
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
