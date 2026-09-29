/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  Trash2, 
  Volume2, 
  VolumeX, 
  Star, 
  X, 
  Sparkles, 
  CheckCircle2,
  ListTodo,
  Flame,
  FileText,
  TrendingUp,
  Award,
  CircleDot,
  AlertCircle,
  Pencil,
  Settings,
  Mic,
  MicOff,
  Palette,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from './firebase';
import { playPop, playWoosh, playSuccess, playFanfare } from './sound';

// Column Interface (Fully Dynamic!)
interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
}

// Vibrant color palette constants ensuring columns and cards share cohesive vibrant colors
export const VIBRANT_COLUMN_PALETTE = [
  '#FF3B30', // System Red
  '#34C759', // System Green
  '#007AFF', // System Blue
  '#5856D6', // System Violet
  '#FF9500', // System Orange
  '#FF2D55', // System Pink
  '#AF52DE', // System Purple
  '#5AC8FA', // System Teal
  '#FFCC00', // System Yellow
];

export const VIBRANT_COLOR_SWATCHES = [
  { hex: '#FF3B30', name: 'Rojo' },
  { hex: '#34C759', name: 'Verde' },
  { hex: '#007AFF', name: 'Azul' },
  { hex: '#5856D6', name: 'Índigo' },
  { hex: '#FF9500', name: 'Naranja' },
  { hex: '#FF2D55', name: 'Rosa' },
  { hex: '#AF52DE', name: 'Púrpura' },
  { hex: '#5AC8FA', name: 'Teal' },
  { hex: '#FFCC00', name: 'Amarillo' },
];

export const getColumnVibrantColor = (col?: KanbanColumn | null, index = 0): string => {
  if (col && col.color && col.color.trim()) return col.color;
  return VIBRANT_COLUMN_PALETTE[index % VIBRANT_COLUMN_PALETTE.length];
};

// Client-side fallback voice command parser (100% resilient even if offline or server fails)
function parseVoiceCommandFallbackClient(text: string, sheets: any[], columns: any[]) {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const actions: any[] = [];
  let speechFeedback = '';

  if (lower.includes('desactivar sonido') || lower.includes('quitar sonido') || lower.includes('silenciar')) {
    actions.push({ type: 'toggle_sound', enabled: false });
    return { actions, speechFeedback: 'Sonidos desactivados.' };
  }
  if (lower.includes('activar sonido') || lower.includes('poner sonido') || lower.includes('con sonido')) {
    actions.push({ type: 'toggle_sound', enabled: true });
    return { actions, speechFeedback: 'Sonidos activados.' };
  }

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

// Board Sheet Interface
interface Sheet {
  id: string;
  title: string;
  createdAt: number;
  columns?: KanbanColumn[]; // custom columns stored per board/sheet
  order?: number;
}

// Task Interface
interface Task {
  id: string;
  title: string;
  description: string;
  column: string; // references KanbanColumn.id
  createdAt: any;
  completedAt?: any;
}

// Interactive 3D Canvas Particle Engine
interface Particle3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  type: 'cube' | 'star' | 'diamond' | 'sphere';
  rotX: number;
  rotY: number;
  rotZ: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
}

// Default columns set used if not configured in the Firestore board doc
const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'pending', title: 'Pendientes' },
  { id: 'progress', title: 'En Proceso' },
  { id: 'done', title: 'Listo' }
];

export default function App() {
  // Lists of sheets (mapped directly to the Firestore "boards" collection)
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string>('');
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const prevSheetId = useRef<string>(activeSheetId);

  // Active view: 'board' (Kanban) or 'analytics'
  const [activeView, setActiveView] = useState<'board' | 'analytics'>('board');

  // Tasks in active sheet
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  // Sheet creation form
  const [showAddSheetInput, setShowAddSheetInput] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState('');

  // Edit sheet modal form
  const [editingSheet, setEditingSheet] = useState<Sheet | null>(null);
  const [editSheetTitle, setEditSheetTitle] = useState('');

  // Edit task modal form
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');

  // Column creation and edit form
  const [showAddColumnInput, setShowAddColumnInput] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editColumnTitle, setEditColumnTitle] = useState('');
  const [editColumnColor, setEditColumnColor] = useState<string>('');
  const [activeColorPickerColId, setActiveColorPickerColId] = useState<string | null>(null);
  const [showMobileSheetsDrawer, setShowMobileSheetsDrawer] = useState(false);
  const [showCompletedSheetsSection, setShowCompletedSheetsSection] = useState(false);
  const [deletingColumnId, setDeletingColumnId] = useState<string | null>(null);
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);

  // Sound configuration
  const [soundEnabled, setSoundEnabled] = useState(true);

  // New task form
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [formError, setFormError] = useState('');

  // Inline task form states
  const [inlineTaskTitle, setInlineTaskTitle] = useState('');
  const [inlineTaskDesc, setInlineTaskDesc] = useState('');

  // Celebration state
  const [celebrationTask, setCelebrationTask] = useState<{ title: string; points: number } | null>(null);

  // Real-time multiplayer synchronization refs
  const appLoadedAt = useRef<number>(Date.now());
  const processedCelebrations = useRef<Set<string>>(new Set());

  // Cache stats of sheets
  const [sheetStats, setSheetStats] = useState<{[key: string]: { total: number; completed: number; pending: number; progress: number }}>({});

  // AI Voice Control states
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceSuccessMessage, setVoiceSuccessMessage] = useState('');
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Active sheet columns list (resolved dynamically)
  const activeSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];
  const activeColumns = activeSheet?.columns || [];

  // Load offline sheet configuration
  const loadLocalSheetsBackup = () => {
    const stored = localStorage.getItem('sincrotask_sheets_list');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) {
          setSheets(parsed);
          const lastActive = localStorage.getItem('sincrotask_active_sheet_id');
          if (lastActive && parsed.some((s: Sheet) => s.id === lastActive)) {
            setActiveSheetId(lastActive);
          } else {
            setActiveSheetId(parsed[0].id);
          }
        }
      } catch (e) {
        console.error("Error parsing sheets backup:", e);
      }
    }
  };

  // Sync sheets backup initially
  useEffect(() => {
    loadLocalSheetsBackup();
  }, []);

  // Shortcut [Shift + A] for desktop layout to add a new pending task
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Trigger only if Shift + A is pressed (case-insensitive or specifically 'A' / 'a')
      // Make sure we are not focused on any input, textarea, or contenteditable element
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );

      if (e.shiftKey && (e.key === 'A' || e.key === 'a') && !isTyping) {
        e.preventDefault();
        if (soundEnabled) playPop();
        setShowAddTask(true);
      }

      // Shortcut [Shift + V] for quick voice assistant activation
      if (e.shiftKey && (e.key === 'V' || e.key === 'v') && !isTyping) {
        e.preventDefault();
        if (soundEnabled) playPop();
        setIsVoiceAssistantOpen(true);
        setTimeout(() => {
          handleStartVoiceRecognition();
        }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [soundEnabled]);

  // Update slide transition direction based on tab index movement
  useEffect(() => {
    if (activeSheetId && activeSheetId !== prevSheetId.current) {
      const oldIdx = sheets.findIndex(s => s.id === prevSheetId.current);
      const newIdx = sheets.findIndex(s => s.id === activeSheetId);
      if (oldIdx !== -1 && newIdx !== -1) {
        setSlideDirection(newIdx > oldIdx ? 'right' : 'left');
      }
      prevSheetId.current = activeSheetId;
    }
  }, [activeSheetId, sheets]);

  // Real-time boards loader from Firestore "boards" root collection
  useEffect(() => {
    if (isOfflineFallback) return;

    const boardsRef = collection(db, 'boards');
    const unsubscribe = onSnapshot(boardsRef, (snapshot) => {
      const sheetsList: Sheet[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        sheetsList.push({
          id: docSnap.id,
          title: data.title || docSnap.id,
          createdAt: data.createdAt || Date.now(),
          columns: data.columns || DEFAULT_COLUMNS,
          order: data.order ?? 0
        });
      });

      sheetsList.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
      setSheets(sheetsList);
      localStorage.setItem('sincrotask_sheets_list', JSON.stringify(sheetsList));

      const lastActive = localStorage.getItem('sincrotask_active_sheet_id');
      if (lastActive && sheetsList.some(s => s.id === lastActive)) {
        setActiveSheetId(lastActive);
      } else if (sheetsList.length > 0) {
        setActiveSheetId(sheetsList[0].id);
      } else {
        setActiveSheetId('');
      }
    }, (err) => {
      console.warn("Permissions missing or offline. Reading boards from local storage:", err);
      setIsOfflineFallback(true);
      loadLocalSheetsBackup();
      handleFirestoreError(err, OperationType.LIST, 'boards');
    });

    return () => unsubscribe();
  }, [isOfflineFallback]);

  // Load and calculate task stats of all sheets
  useEffect(() => {
    const stats: {[key: string]: { total: number; completed: number; pending: number; progress: number }} = {};
    
    sheets.forEach(sheet => {
      let sheetTasks: Task[] = [];
      if (sheet.id === activeSheetId) {
        sheetTasks = tasks;
      } else {
        const stored = localStorage.getItem(`sincrotask_tasks_backup_${sheet.id}`);
        if (stored) {
          try {
            sheetTasks = JSON.parse(stored);
          } catch (e) {}
        }
      }

      // Resolve the completed column ID (the last column of this sheet)
      const cols = sheet.columns || DEFAULT_COLUMNS;
      const lastColId = cols[cols.length - 1]?.id || 'done';

      stats[sheet.id] = {
        total: sheetTasks.length,
        completed: sheetTasks.filter(t => t.column === lastColId).length,
        pending: sheetTasks.filter(t => t.column === cols[0]?.id).length,
        progress: sheetTasks.filter(t => t.column !== cols[0]?.id && t.column !== lastColId).length
      };
    });

    setSheetStats(stats);
  }, [sheets, activeSheetId, tasks]);

  // Real-time tasks loader grouped by Sheet (Board)
  useEffect(() => {
    if (!activeSheetId) {
      setLoading(false);
      return;
    }

    localStorage.setItem('sincrotask_active_sheet_id', activeSheetId);

    const loadLocalTasksBackup = () => {
      const stored = localStorage.getItem(`sincrotask_tasks_backup_${activeSheetId}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored).map((t: any) => ({
            ...t,
            createdAt: new Date(t.createdAt)
          }));
          setTasks(parsed);
        } catch (e) {
          console.error("Error parsing tasks backup for sheet:", e);
          setTasks([]);
        }
      } else {
        setTasks([]);
      }
    };

    // Load local storage cache instantly to eliminate any visual lag when switching sheets!
    loadLocalTasksBackup();

    if (isOfflineFallback) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const tasksRef = collection(db, 'boards', activeSheetId, 'tasks');

    const unsubscribe = onSnapshot(tasksRef, (snapshot) => {
      const taskList: Task[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        
        let taskDate = new Date();
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            taskDate = data.createdAt.toDate();
          } else if (data.createdAt instanceof Date) {
            taskDate = data.createdAt;
          } else if (typeof data.createdAt === 'string') {
            taskDate = new Date(data.createdAt);
          } else if (data.createdAt.seconds) {
            taskDate = new Date(data.createdAt.seconds * 1000);
          }
        }

        taskList.push({
          id: docSnap.id,
          title: data.title,
          description: data.description || '',
          column: data.column || 'pending',
          createdAt: taskDate,
          completedAt: data.completedAt
        });
      });

      taskList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setTasks(taskList);
      
      localStorage.setItem(`sincrotask_tasks_backup_${activeSheetId}`, JSON.stringify(taskList));
      setLoading(false);
    }, (err) => {
      console.warn("Permission error loading sheet tasks. Activating local mode:", err);
      setIsOfflineFallback(true);
      loadLocalTasksBackup();
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, `boards/${activeSheetId}/tasks`);
    });

    return () => unsubscribe();
  }, [activeSheetId, isOfflineFallback]);

  // Real-time listener for multiplayer task completions (real-time celebration across all devices simultaneously!)
  useEffect(() => {
    if (isOfflineFallback) return;

    const celebrationsRef = collection(db, 'celebrations');
    const unsubscribe = onSnapshot(celebrationsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const id = change.doc.id;
          if (data && data.timestamp && data.timestamp > appLoadedAt.current) {
            if (!processedCelebrations.current.has(id)) {
              processedCelebrations.current.add(id);
              // Trigger the congratulations screen instantly on all devices!
              if (soundEnabled) playSuccess();
              setCelebrationTask({
                title: data.taskTitle || 'Pendiente',
                points: data.points || 1
              });
            }
          }
        }
      });
    }, (err) => {
      console.warn("Unable to subscribe to multiplayer celebrations:", err);
      handleFirestoreError(err, OperationType.LIST, 'celebrations');
    });

    return () => unsubscribe();
  }, [isOfflineFallback, soundEnabled]);

  // Create sheet directly inside the "boards" collection
  const handleAddSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newSheetTitle.trim();
    if (!title) return;

    if (soundEnabled) playFanfare();

    const newId = 'sheet_' + Math.random().toString(36).substr(2, 9);
    const newSheet: Sheet = {
      id: newId,
      title: title,
      createdAt: Date.now(),
      columns: DEFAULT_COLUMNS,
      order: sheets.length
    };

    const updatedSheets = [...sheets, newSheet];
    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    setActiveSheetId(newId);
    setNewSheetTitle('');
    setShowAddSheetInput(false);

    if (isOfflineFallback) return;

    try {
      await setDoc(doc(db, 'boards', newId), {
        title: title,
        createdAt: newSheet.createdAt,
        columns: DEFAULT_COLUMNS,
        order: newSheet.order
      });
    } catch (err) {
      console.warn("Unable to sync new sheet online (Permissions):", err);
      setIsOfflineFallback(true);
      handleFirestoreError(err, OperationType.WRITE, `boards/${newId}`);
    }
  };

  // Edit current Sheet's Title and Emoji
  const handleEditSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSheet || !editSheetTitle.trim()) return;

    if (soundEnabled) playPop();

    const title = editSheetTitle.trim();

    const updatedSheets = sheets.map(s => {
      if (s.id === editingSheet.id) {
        return { ...s, title };
      }
      return s;
    });

    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    setEditingSheet(null);

    if (isOfflineFallback) return;

    try {
      await updateDoc(doc(db, 'boards', editingSheet.id), {
        title: title
      });
    } catch (err) {
      console.warn("Unable to edit sheet online (Permissions):", err);
      handleFirestoreError(err, OperationType.UPDATE, `boards/${editingSheet.id}`);
    }
  };

  // Delete sheet from "boards" collection
  const handleDeleteSheet = async (sheetIdToDelete: string) => {
    if (soundEnabled) playPop();

    const updatedSheets = sheets.filter(s => s.id !== sheetIdToDelete);
    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    localStorage.removeItem(`sincrotask_tasks_backup_${sheetIdToDelete}`);

    if (updatedSheets.length > 0) {
      if (activeSheetId === sheetIdToDelete) {
        setActiveSheetId(updatedSheets[0].id);
      }
    } else {
      setActiveSheetId('');
    }

    if (isOfflineFallback) return;

    try {
      await deleteDoc(doc(db, 'boards', sheetIdToDelete));
    } catch (err) {
      console.warn("Unable to sync sheet deletion online:", err);
      handleFirestoreError(err, OperationType.DELETE, `boards/${sheetIdToDelete}`);
    }
  };

  // ==========================================
  // AI VOICE CONTROL ASSISTANT LOGIC
  // ==========================================
  const executeVoiceActions = async (actions: any[], feedback: string) => {
    let currentActiveSheetId = activeSheetId;
    let currentSheets = [...sheets];
    let currentTasks = [...tasks];

    for (const action of actions) {
      if (action.type === 'create_sheet') {
        const title = action.title?.trim();
        if (title) {
          const newId = 'sheet_' + Math.random().toString(36).substr(2, 9);
          const newSheet: Sheet = {
            id: newId,
            title,
            createdAt: Date.now(),
            columns: DEFAULT_COLUMNS,
            order: currentSheets.length
          };
          currentSheets = [...currentSheets, newSheet];
          setSheets(currentSheets);
          localStorage.setItem('sincrotask_sheets_list', JSON.stringify(currentSheets));
          currentActiveSheetId = newId;
          setActiveSheetId(newId);

          if (!isOfflineFallback) {
            try {
              await setDoc(doc(db, 'boards', newId), {
                title,
                createdAt: newSheet.createdAt,
                columns: DEFAULT_COLUMNS,
                order: newSheet.order
              });
            } catch (err) {
              console.warn("Unable to sync new sheet:", err);
            }
          }
        }
      }

      else if (action.type === 'switch_sheet') {
        const title = action.title?.toLowerCase()?.trim();
        const id = action.sheetId;
        const found = currentSheets.find(s => s.id === id || s.title.toLowerCase().trim() === title);
        if (found) {
          currentActiveSheetId = found.id;
          setActiveSheetId(found.id);
        }
      }

      else if (action.type === 'add_tasks') {
        const titlesToAdd = Array.isArray(action.titles) ? action.titles : [];
        if (titlesToAdd.length > 0 && currentActiveSheetId) {
          const firstColId = activeColumns[0]?.id || 'pending';
          const newTasksList: Task[] = [];

          for (const titleText of titlesToAdd) {
            if (!titleText.trim()) continue;
            const tempId = 'task_' + Math.random().toString(36).substr(2, 9);
            const newTask: Task = {
              id: tempId,
              title: titleText.trim(),
              description: '',
              column: firstColId,
              createdAt: new Date()
            };
            newTasksList.push(newTask);

            if (!isOfflineFallback) {
              try {
                const tasksRef = collection(db, 'boards', currentActiveSheetId, 'tasks');
                await addDoc(tasksRef, {
                  title: newTask.title,
                  description: '',
                  column: newTask.column,
                  points: 1,
                  createdAt: newTask.createdAt
                });
              } catch (err) {
                console.warn("Firestore error adding task:", err);
              }
            }
          }

          if (currentActiveSheetId === activeSheetId) {
            currentTasks = [...newTasksList, ...currentTasks];
            setTasks(currentTasks);
            localStorage.setItem(`sincrotask_tasks_backup_${currentActiveSheetId}`, JSON.stringify(currentTasks));
          }
        }
      }

      else if (action.type === 'delete_tasks') {
        const titlesToDelete = Array.isArray(action.titles) ? action.titles.map((t: string) => t.toLowerCase().trim()) : [];
        if (titlesToDelete.length > 0 && currentActiveSheetId) {
          const tasksToKeep: Task[] = [];
          const tasksToRemove: Task[] = [];

          for (const t of currentTasks) {
            const lowTitle = t.title.toLowerCase().trim();
            if (titlesToDelete.some((titleDel: string) => lowTitle.includes(titleDel) || titleDel.includes(lowTitle))) {
              tasksToRemove.push(t);
            } else {
              tasksToKeep.push(t);
            }
          }

          if (tasksToRemove.length > 0) {
            if (currentActiveSheetId === activeSheetId) {
              currentTasks = tasksToKeep;
              setTasks(currentTasks);
              localStorage.setItem(`sincrotask_tasks_backup_${currentActiveSheetId}`, JSON.stringify(currentTasks));
            }

            if (!isOfflineFallback) {
              for (const taskToRemove of tasksToRemove) {
                try {
                  await deleteDoc(doc(db, 'boards', currentActiveSheetId, 'tasks', taskToRemove.id));
                } catch (err) {
                  console.warn("Firestore error deleting task:", err);
                }
              }
            }
          }
        }
      }

      else if (action.type === 'toggle_sound') {
        if (typeof action.enabled === 'boolean') {
          setSoundEnabled(action.enabled);
        }
      }
    }

    if (soundEnabled) playSuccess();

    // Trigger local speech read-back
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(feedback);
      utterance.lang = 'es-ES';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleStartVoiceRecognition = () => {
    setVoiceError('');
    setVoiceSuccessMessage('');
    setVoiceText('');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError('Tu navegador no es compatible con reconocimiento de voz.');
      return;
    }

    if (soundEnabled) playPop();

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (e: any) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setVoiceText(transcript);
    };

    recognition.onerror = (e: any) => {
      console.error("Speech Recognition Error:", e);
      if (e.error === 'no-speech') {
        setVoiceError('No se detectó voz. Hable de nuevo cuando esté listo.');
      } else if (e.error === 'not-allowed') {
        setVoiceError('Acceso al micrófono denegado. Concede permisos de audio en tu navegador o iframe.');
      } else if (e.error === 'audio-capture') {
        setVoiceError('No se encontró ningún micrófono conectado en este dispositivo.');
      } else {
        setVoiceError(`Error de voz (${e.error || 'desconocido'}). Inténtalo de nuevo.`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleStopVoiceRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const processVoiceCommand = async (command: string) => {
    setIsVoiceProcessing(true);
    setVoiceError('');
    try {
      let result: any = null;
      try {
        const response = await fetch('/api/ai/voice-control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: command,
            existingSheets: sheets,
            existingColumns: activeColumns
          })
        });

        if (response.ok) {
          result = await response.json();
        }
      } catch (networkErr) {
        console.warn("Backend voice endpoint unreachable, running instant client semantic parser:", networkErr);
      }

      // If backend didn't return actions, execute local Spanish semantic parser fallback
      if (!result || !result.actions || result.actions.length === 0) {
        result = parseVoiceCommandFallbackClient(command, sheets, activeColumns);
      }

      if (result.actions && result.actions.length > 0) {
        await executeVoiceActions(result.actions, result.speechFeedback);
        setVoiceSuccessMessage(result.speechFeedback);
        // Automatically close modal and return to initial screen
        setIsVoiceAssistantOpen(false);
        setVoiceText('');
      } else {
        setVoiceSuccessMessage(result.speechFeedback || 'Comando entendido.');
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(result.speechFeedback || 'Comando procesado.');
          utterance.lang = 'es-ES';
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch (err: any) {
      console.warn("Voice processing error, executing fallback:", err);
      const fallbackResult = parseVoiceCommandFallbackClient(command, sheets, activeColumns);
      await executeVoiceActions(fallbackResult.actions, fallbackResult.speechFeedback);
      setVoiceSuccessMessage(fallbackResult.speechFeedback);
      // Automatically close modal and return to initial screen
      setIsVoiceAssistantOpen(false);
      setVoiceText('');
    } finally {
      setIsVoiceProcessing(false);
    }
  };

  // Highly premium interactive 3D parallax column tilt on mouse hover
  const handleColumnMouseMove3D = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 1024) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    // Bounded smooth rotation
    const rotateY = ((x - xc) / xc) * 7; // up to 7 degrees
    const rotateX = -((y - yc) / yc) * 7;
    
    el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;
    el.style.boxShadow = '0 30px 65px rgba(0, 0, 0, 0.65)';
    el.style.transition = 'transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)';
  };

  const handleColumnMouseLeave3D = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.style.transform = '';
    el.style.boxShadow = '';
    el.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
  };

  // Reorganize sheet position (swap with neighbor and update order)
  const handleMoveSheet = async (sheetId: string, direction: 'left' | 'right') => {
    const currentIndex = sheets.findIndex(s => s.id === sheetId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + (direction === 'left' ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= sheets.length) return;

    if (soundEnabled) playWoosh();

    const updatedSheets = [...sheets];
    const temp = updatedSheets[currentIndex];
    updatedSheets[currentIndex] = updatedSheets[nextIndex];
    updatedSheets[nextIndex] = temp;

    // Force re-order index assignment
    const reorderedSheets = updatedSheets.map((sheet, index) => ({
      ...sheet,
      order: index
    }));

    setSheets(reorderedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(reorderedSheets));

    if (isOfflineFallback) return;

    try {
      for (const sheet of reorderedSheets) {
        await updateDoc(doc(db, 'boards', sheet.id), {
          order: sheet.order
        });
      }
    } catch (err) {
      console.warn("Unable to save sheet order online:", err);
      handleFirestoreError(err, OperationType.UPDATE, `boards`);
    }
  };

  // Create task (defaults to the first column ID dynamically!)
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!taskTitle.trim()) return;

    if (soundEnabled) playPop();

    const firstColId = activeColumns[0]?.id || 'pending';
    const tempId = 'task_' + Math.random().toString(36).substr(2, 9);
    const newTask: Task = {
      id: tempId,
      title: taskTitle.trim(),
      description: taskDesc.trim(),
      column: firstColId,
      createdAt: new Date()
    };

    const updated = [newTask, ...tasks];
    setTasks(updated);
    localStorage.setItem(`sincrotask_tasks_backup_${activeSheetId}`, JSON.stringify(updated));

    setShowAddTask(false);
    setTaskTitle('');
    setTaskDesc('');

    if (isOfflineFallback) return;

    try {
      const tasksRef = collection(db, 'boards', activeSheetId, 'tasks');
      await addDoc(tasksRef, {
        title: newTask.title,
        description: newTask.description,
        column: newTask.column,
        points: 1, // 1 XP default
        createdAt: newTask.createdAt
      });
    } catch (err: any) {
      console.warn("Firestore error on task save. Continuing in local backup mode:", err);
      setIsOfflineFallback(true);
      handleFirestoreError(err, OperationType.CREATE, `boards/${activeSheetId}/tasks`);
    }
  };

  // Create task directly from inline pending creator form
  const handleCreateInlineTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = inlineTaskTitle.trim();
    if (!title) return;

    if (soundEnabled) playPop();

    const firstColId = activeColumns[0]?.id || 'pending';
    const tempId = 'task_' + Math.random().toString(36).substr(2, 9);
    const newTask: Task = {
      id: tempId,
      title: title,
      description: inlineTaskDesc.trim(),
      column: firstColId,
      createdAt: new Date()
    };

    const updated = [newTask, ...tasks];
    setTasks(updated);
    localStorage.setItem(`sincrotask_tasks_backup_${activeSheetId}`, JSON.stringify(updated));

    setInlineTaskTitle('');
    setInlineTaskDesc('');

    if (isOfflineFallback) return;

    try {
      const tasksRef = collection(db, 'boards', activeSheetId, 'tasks');
      await addDoc(tasksRef, {
        title: newTask.title,
        description: newTask.description,
        column: newTask.column,
        points: 1, // 1 XP default
        createdAt: newTask.createdAt
      });
    } catch (err: any) {
      console.warn("Firestore error on inline task save:", err);
      setIsOfflineFallback(true);
      handleFirestoreError(err, OperationType.CREATE, `boards/${activeSheetId}/tasks`);
    }
  };

  // Edit task details (Title & Description)
  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTaskTitle.trim()) return;

    if (soundEnabled) playPop();

    const updatedTasks = tasks.map(t => {
      if (t.id === editingTask.id) {
        return {
          ...t,
          title: editTaskTitle.trim(),
          description: editTaskDesc.trim()
        };
      }
      return t;
    });

    setTasks(updatedTasks);
    localStorage.setItem(`sincrotask_tasks_backup_${activeSheetId}`, JSON.stringify(updatedTasks));
    setEditingTask(null);

    if (isOfflineFallback) return;

    try {
      const taskDocRef = doc(db, 'boards', activeSheetId, 'tasks', editingTask.id);
      await updateDoc(taskDocRef, {
        title: editTaskTitle.trim(),
        description: editTaskDesc.trim()
      });
    } catch (err) {
      console.warn("Firebase task edit failed:", err);
      handleFirestoreError(err, OperationType.UPDATE, `boards/${activeSheetId}/tasks/${editingTask.id}`);
    }
  };

  // Move task left or right along custom dynamic columns
  const handleMoveTask = async (task: Task, direction: 'left' | 'right') => {
    const currentIndex = activeColumns.findIndex(c => c.id === task.column);
    const nextIndex = currentIndex + (direction === 'left' ? -1 : 1);

    if (nextIndex < 0 || nextIndex >= activeColumns.length) return;

    const nextColumn = activeColumns[nextIndex];
    const lastColId = activeColumns[activeColumns.length - 1]?.id || 'done';
    
    const updatedTasks = tasks.map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          column: nextColumn.id,
          completedAt: nextColumn.id === lastColId ? new Date() : undefined
        };
      }
      return t;
    });

    setTasks(updatedTasks);
    localStorage.setItem(`sincrotask_tasks_backup_${activeSheetId}`, JSON.stringify(updatedTasks));

    if (nextColumn.id === lastColId) {
      if (soundEnabled) playSuccess();
      setCelebrationTask({
        title: task.title,
        points: 1
      });

      // Write celebration event to Firestore for real-time multiplayer notification across all screens
      if (!isOfflineFallback) {
        try {
          const celebrationsRef = collection(db, 'celebrations');
          await addDoc(celebrationsRef, {
            taskTitle: task.title,
            points: 1,
            timestamp: Date.now()
          });
        } catch (err) {
          console.warn("Unable to sync celebration online:", err);
          handleFirestoreError(err, OperationType.CREATE, `celebrations`);
        }
      }
    } else {
      if (soundEnabled) playWoosh();
    }

    if (isOfflineFallback) return;

    try {
      const taskDocRef = doc(db, 'boards', activeSheetId, 'tasks', task.id);
      await updateDoc(taskDocRef, { 
        column: nextColumn.id,
        completedAt: nextColumn.id === lastColId ? new Date() : null
      });
    } catch (err) {
      console.warn("Firebase task move failed, switched to local storage:", err);
      setIsOfflineFallback(true);
      handleFirestoreError(err, OperationType.UPDATE, `boards/${activeSheetId}/tasks/${task.id}`);
    }
  };

  // Delete task
  const handleDeleteTask = async (task: Task) => {
    if (soundEnabled) playPop();

    const updatedTasks = tasks.filter(t => t.id !== task.id);
    setTasks(updatedTasks);
    localStorage.setItem(`sincrotask_tasks_backup_${activeSheetId}`, JSON.stringify(updatedTasks));

    if (isOfflineFallback) return;

    try {
      const taskDocRef = doc(db, 'boards', activeSheetId, 'tasks', task.id);
      await deleteDoc(taskDocRef);
    } catch (err) {
      console.warn("Firebase task delete failed, switched to local storage:", err);
      setIsOfflineFallback(true);
      handleFirestoreError(err, OperationType.DELETE, `boards/${activeSheetId}/tasks/${task.id}`);
    }
  };

  // Create a brand new Column dynamically!
  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) return;

    if (soundEnabled) playPop();

    const newColId = 'col_' + Math.random().toString(36).substr(2, 9);
    const updatedColumns = [...activeColumns, { id: newColId, title }];

    const updatedSheets = sheets.map(s => {
      if (s.id === activeSheetId) {
        return { ...s, columns: updatedColumns };
      }
      return s;
    });

    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    setNewColumnTitle('');
    setShowAddColumnInput(false);

    if (isOfflineFallback) return;

    try {
      await updateDoc(doc(db, 'boards', activeSheetId), {
        columns: updatedColumns
      });
    } catch (err) {
      console.warn("Failed to create column online:", err);
      handleFirestoreError(err, OperationType.UPDATE, `boards/${activeSheetId}`);
    }
  };

  // Rename and Recolor a Column
  const handleEditColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColumnId || !editColumnTitle.trim()) return;

    if (soundEnabled) playPop();

    const updatedColumns = activeColumns.map(c => {
      if (c.id === editingColumnId) {
        return { ...c, title: editColumnTitle.trim(), color: editColumnColor };
      }
      return c;
    });

    const updatedSheets = sheets.map(s => {
      if (s.id === activeSheetId) {
        return { ...s, columns: updatedColumns };
      }
      return s;
    });

    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    setEditingColumnId(null);
    setEditColumnTitle('');
    setEditColumnColor('');

    if (isOfflineFallback) return;

    try {
      await updateDoc(doc(db, 'boards', activeSheetId), {
        columns: updatedColumns
      });
    } catch (err) {
      console.warn("Failed to update column online:", err);
      handleFirestoreError(err, OperationType.UPDATE, `boards/${activeSheetId}`);
    }
  };

  // Quick 1-click column color updater
  const handleQuickSetColumnColor = async (colId: string, colorHex: string) => {
    if (soundEnabled) playPop();
    const updatedColumns = activeColumns.map(c => {
      if (c.id === colId) {
        return { ...c, color: colorHex };
      }
      return c;
    });

    const updatedSheets = sheets.map(s => {
      if (s.id === activeSheetId) {
        return { ...s, columns: updatedColumns };
      }
      return s;
    });

    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    setActiveColorPickerColId(null);

    if (isOfflineFallback) return;

    try {
      await updateDoc(doc(db, 'boards', activeSheetId), {
        columns: updatedColumns
      });
    } catch (err) {
      console.warn("Failed to set column color:", err);
      handleFirestoreError(err, OperationType.UPDATE, `boards/${activeSheetId}`);
    }
  };

  // Delete a Column (moves tasks from this column to the remaining first column)
  const handleDeleteColumn = async (colIdToDelete: string) => {
    if (soundEnabled) playPop();

    const updatedColumns = activeColumns.filter(c => c.id !== colIdToDelete);
    const firstColId = updatedColumns[0]?.id || 'pending';

    // Locally remap tasks in this column
    const updatedTasks = tasks.map(t => {
      if (t.column === colIdToDelete) {
        return { ...t, column: firstColId };
      }
      return t;
    });

    setTasks(updatedTasks);
    localStorage.setItem(`sincrotask_tasks_backup_${activeSheetId}`, JSON.stringify(updatedTasks));

    const updatedSheets = sheets.map(s => {
      if (s.id === activeSheetId) {
        return { ...s, columns: updatedColumns };
      }
      return s;
    });

    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));

    if (isOfflineFallback) return;

    try {
      // 1. Update columns array in sheet safely
      await setDoc(doc(db, 'boards', activeSheetId), {
        columns: updatedColumns
      }, { merge: true });

      // 2. Remap tasks on Firebase safely
      for (const t of tasks) {
        if (t.column === colIdToDelete) {
          await setDoc(doc(db, 'boards', activeSheetId, 'tasks', t.id), {
            column: firstColId
          }, { merge: true });
        }
      }
    } catch (err) {
      console.warn("Failed to delete column online:", err);
      handleFirestoreError(err, OperationType.UPDATE, `boards/${activeSheetId}`);
    }
  };

  // Medals Calculation
  const calculateMedals = () => {
    let medals = 0;
    Object.keys(sheetStats).forEach(id => {
      const stat = sheetStats[id];
      if (stat.total > 0 && stat.pending === 0 && stat.progress === 0) {
        medals += 1;
      }
    });
    return medals;
  };

  // Stats calculation
  const totalTasks = tasks.length;
  const lastColId = activeColumns[activeColumns.length - 1]?.id || 'done';
  const firstColId = activeColumns[0]?.id || 'pending';
  const completedTasksCount = tasks.filter(t => t.column === lastColId).length;
  const progressTasksCount = tasks.filter(t => t.column !== firstColId && t.column !== lastColId).length;
  const pendingTasksCount = tasks.filter(t => t.column === firstColId).length;
  const totalXP = completedTasksCount;
  const totalMedals = calculateMedals();
  const totalXPVal = totalXP;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans relative overflow-x-hidden select-none">
      
      {/* TOP HEADER */}
      <header className="border-b border-zinc-800 bg-[#0c0c0e]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          
          <div className="flex items-center">
            <div className="p-2 bg-violet-600/10 border border-violet-500/30 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.2)] flex items-center justify-center transition-all duration-300 hover:border-violet-400/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <ListTodo className="w-5 h-5 text-violet-400 filter drop-shadow-[0_0_4px_rgba(99,102,241,0.5)] cursor-pointer" />
            </div>
          </div>

          {/* Quick toggle view */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800/60">
            <button
              onClick={() => { if (soundEnabled) playPop(); setActiveView('board'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeView === 'board' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Tablero
            </button>
            <button
              onClick={() => { if (soundEnabled) playPop(); setActiveView('analytics'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeView === 'analytics' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Analíticas
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (soundEnabled) playPop(); setIsVoiceAssistantOpen(true); }}
              className="hidden md:flex p-2 px-3 rounded-xl bg-violet-600/15 border border-violet-500/35 text-violet-400 hover:text-white transition-all cursor-pointer items-center gap-1.5 shadow-[0_0_12px_rgba(99,102,241,0.15)] hover:border-violet-400"
              title="Asistente de Voz IA (Shift + V)"
            >
              <Mic className="w-4 h-4 animate-pulse text-violet-400" />
              <span className="text-[10px] font-extrabold tracking-wider uppercase">Voz IA</span>
              <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-violet-950/80 border border-violet-500/30 text-violet-300 font-mono font-bold">⇧V</kbd>
            </button>
            <button 
              onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) setTimeout(playPop, 50); }}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
              title={soundEnabled ? "Desactivar sonidos" : "Activar sonidos"}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-5 flex flex-col gap-5">
        {sheets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-zinc-900/25 border border-zinc-800 rounded-3xl py-20 animate-sheet-transition">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-5 shadow-[0_0_30px_rgba(99,102,241,0.15)] animate-bounce">
              <ListTodo className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-white mb-2">No hay hojas creadas</h3>
            <p className="text-zinc-400 text-xs max-w-sm mb-6">
              Organiza tus pendientes creando una hoja colaborativa. Podrás agregar columnas personalizadas y tareas con efectos 3D.
            </p>
            {showAddSheetInput ? (
              <form onSubmit={handleAddSheet} className="flex flex-col sm:flex-row items-center gap-2.5 p-3 bg-zinc-950 border border-zinc-800 rounded-2xl animate-scale-up shadow-2xl max-w-md w-full">
                <div className="flex items-center gap-2 flex-1 w-full">
                  <input 
                    type="text" 
                    value={newSheetTitle}
                    onChange={(e) => setNewSheetTitle(e.target.value)}
                    placeholder="Nombre de tu primera hoja..."
                    maxLength={20}
                    className="bg-black border border-zinc-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-500 flex-1 w-full"
                    autoFocus
                    required
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={() => { if (soundEnabled) playPop(); setShowAddSheetInput(false); }}
                    className="px-3 py-2 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl cursor-pointer transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-violet-600/10 cursor-pointer"
                  >
                    Crear Hoja
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => { if (soundEnabled) playPop(); setShowAddSheetInput(true); }}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-violet-600/20 cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Crear mi Primera Hoja</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Gamification Banner & Stat Indicators */}
            <div className="grid grid-cols-3 gap-3 bg-zinc-900/40 p-3 sm:p-4 rounded-2xl border border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Flame className="w-5 h-5 text-amber-500 animate-bounce" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] text-zinc-400 font-bold uppercase truncate">XP Total</div>
              <div className="text-sm sm:text-base font-mono font-black text-amber-300 tabular-nums">{totalXPVal} <span className="text-[10px] text-zinc-500 font-normal">XP</span></div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 border-x border-zinc-850 px-2">
            <div className="p-2 bg-violet-500/10 border border-violet-500/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-violet-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] text-zinc-400 font-bold uppercase truncate">Listos</div>
              <div className="text-sm sm:text-base font-mono font-black text-violet-300">{completedTasksCount}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <Award className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] text-zinc-400 font-bold uppercase truncate">Medallas</div>
              <div className="text-sm sm:text-base font-mono font-black text-emerald-300">{totalMedals}</div>
            </div>
          </div>
        </div>

        {/* MOBILE DEDICATED SHEET SELECTOR BAR (Optimized for Mobile) */}
        <div className="md:hidden flex flex-col gap-2 p-2.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            {/* Prev Sheet Button */}
            <button
              onClick={() => {
                if (soundEnabled) playWoosh();
                const curIdx = sheets.findIndex(s => s.id === activeSheetId);
                if (curIdx > 0) setActiveSheetId(sheets[curIdx - 1].id);
              }}
              disabled={sheets.findIndex(s => s.id === activeSheetId) <= 0}
              className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-25 disabled:cursor-not-allowed active:scale-95 transition-all cursor-pointer"
              title="Hoja anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Current Active Sheet Selector / Drawer Trigger */}
            <button
              onClick={() => {
                if (soundEnabled) playPop();
                setShowMobileSheetsDrawer(true);
              }}
              className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-950 border border-violet-500/30 text-white font-extrabold text-xs shadow-inner active:scale-[0.98] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Layers className="w-3.5 h-3.5 text-violet-400" />
                <span className="truncate max-w-[130px] text-zinc-100">{activeSheet?.title || 'Mi Tablero'}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-violet-400">
                <span className="text-[10px] font-mono font-bold bg-violet-950/80 px-2 py-0.5 rounded-full border border-violet-500/30">
                  {tasks.length}
                </span>
                <ChevronDown className="w-4 h-4 text-violet-400" />
              </div>
            </button>

            {/* Next Sheet Button */}
            <button
              onClick={() => {
                if (soundEnabled) playWoosh();
                const curIdx = sheets.findIndex(s => s.id === activeSheetId);
                if (curIdx < sheets.length - 1) setActiveSheetId(sheets[curIdx + 1].id);
              }}
              disabled={sheets.findIndex(s => s.id === activeSheetId) >= sheets.length - 1}
              className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 disabled:opacity-25 disabled:cursor-not-allowed active:scale-95 transition-all cursor-pointer"
              title="Hoja siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* New Sheet Quick Trigger */}
            <button
              onClick={() => {
                if (soundEnabled) playPop();
                setShowAddSheetInput(true);
              }}
              className="p-2.5 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-400 active:scale-95 transition-all cursor-pointer hover:bg-violet-600 hover:text-white"
              title="Nueva Hoja"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Quick inline board adder on mobile when clicked */}
          {showAddSheetInput && (
            <form onSubmit={handleAddSheet} className="flex items-center gap-1.5 p-1.5 bg-[#0c0c0e] border border-zinc-800 rounded-xl animate-scale-up shadow-2xl z-20">
              <input 
                type="text" 
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
                placeholder="Nombre de nueva hoja..."
                maxLength={20}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-600 flex-1"
                autoFocus
                required
              />
              <button 
                type="submit"
                className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Crear
              </button>
              <button 
                type="button" 
                onClick={() => setShowAddSheetInput(false)}
                className="p-1 text-zinc-500 hover:text-zinc-350 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* MULTI-SHEET / BOARD TABS SELECTOR BAR - Desktop Layout */}
        <div className="hidden md:flex border-b border-slate-800 items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-2.5 flex-1 -mb-px sheet-tabs-scrollbar">
            {sheets.filter(sheet => {
              const stats = sheetStats[sheet.id] || { total: 0, completed: 0, pending: 0, progress: 0 };
              return !(stats.total > 0 && stats.pending === 0 && stats.progress === 0);
            }).map((sheet, idx) => {
              const stats = sheetStats[sheet.id] || { total: 0, completed: 0, pending: 0, progress: 0 };
              const isCompleted = stats.total > 0 && stats.pending === 0 && stats.progress === 0;
              const isActive = activeSheetId === sheet.id;

              return (
                <SheetTab
                  key={sheet.id}
                  sheet={sheet}
                  idx={idx}
                  sheetsCount={sheets.length}
                  isActive={isActive}
                  isCompleted={isCompleted}
                  onSelect={() => setActiveSheetId(sheet.id)}
                  onMove={handleMoveSheet}
                  onEdit={() => {
                    setEditingSheet(sheet);
                    setEditSheetTitle(sheet.title);
                  }}
                  deletingSheetId={deletingSheetId}
                  setDeletingSheetId={setDeletingSheetId}
                  handleDeleteSheet={handleDeleteSheet}
                />
              );
            })}
          </div>

          {/* Quick inline board adder with custom Emoji picker! */}
          <div className="pb-2 shrink-0">
            {showAddSheetInput ? (
              <form onSubmit={handleAddSheet} className="flex items-center gap-1.5 p-1.5 bg-[#0c0c0e] border border-zinc-800 rounded-xl animate-scale-up shadow-2xl z-20">
                <input 
                  type="text" 
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  placeholder="Nueva Hoja..."
                  maxLength={20}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-violet-500 text-white placeholder:text-zinc-600 w-32"
                  autoFocus
                  required
                />
                <button 
                  type="submit"
                  className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Ok
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowAddSheetInput(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-350 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => { if (soundEnabled) playPop(); setShowAddSheetInput(true); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-violet-400 hover:text-violet-300 transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                <span className="font-sans font-semibold text-xs">Nueva Hoja</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Completed Sheets Section */}
        {(() => {
          const completedSheetsList = sheets.filter(sheet => {
            const stats = sheetStats[sheet.id] || { total: 0, completed: 0, pending: 0, progress: 0 };
            return stats.total > 0 && stats.pending === 0 && stats.progress === 0;
          });

          if (completedSheetsList.length === 0) return null;

          return (
            <div className="flex flex-col gap-2 bg-amber-500/5 border border-amber-500/10 p-3 rounded-2xl">
              <button
                onClick={() => { if (soundEnabled) playPop(); setShowCompletedSheetsSection(!showCompletedSheetsSection); }}
                className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-xl text-xs font-black text-amber-300 transition-all cursor-pointer flex items-center gap-2 self-start shadow-sm"
              >
                <Award className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Hojas Completadas ({completedSheetsList.length})</span>
                <span className="text-[10px] text-amber-500 font-black">
                  {showCompletedSheetsSection ? '▲ Ocultar' : '▼ Mostrar'}
                </span>
              </button>

              {showCompletedSheetsSection && (
                <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1.5 animate-scale-up">
                  {completedSheetsList.map((sheet, idx) => {
                    const stats = sheetStats[sheet.id] || { total: 0, completed: 0, pending: 0, progress: 0 };
                    const isCompleted = stats.total > 0 && stats.pending === 0 && stats.progress === 0;
                    const isActive = activeSheetId === sheet.id;

                    return (
                      <SheetTab
                        key={sheet.id}
                        sheet={sheet}
                        idx={idx}
                        sheetsCount={sheets.length}
                        isActive={isActive}
                        isCompleted={isCompleted}
                        onSelect={() => setActiveSheetId(sheet.id)}
                        onMove={handleMoveSheet}
                        onEdit={() => {
                          setEditingSheet(sheet);
                          setEditSheetTitle(sheet.title);
                        }}
                        deletingSheetId={deletingSheetId}
                        setDeletingSheetId={setDeletingSheetId}
                        handleDeleteSheet={handleDeleteSheet}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* LOADING SHIM */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-800 rounded-2xl">
            <div className="w-8 h-8 rounded-full border-3 border-violet-500/20 border-t-violet-500 animate-spin mb-3" />
            <p className="text-xs font-mono text-slate-500 animate-pulse">Sincronizando hoja...</p>
          </div>
        ) : (
          /* Kanban columns (Only in board view) */
          activeView === 'board' ? (
            <div key={`${activeSheetId}_${slideDirection}`} className={`flex flex-col gap-5 ${slideDirection === 'right' ? 'animate-slide-right' : 'animate-slide-left'}`}>
              
              {/* Dynamic Columns Kanban Grid (Side-by-side on desktop!) */}
              <div className="flex flex-col md:flex-row md:items-start gap-5 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-800">
                {activeColumns.map((col, idx) => {
                  const colTasks = tasks.filter(t => t.column === col.id);
                  const columnVibrantColor = getColumnVibrantColor(col, idx);

                  return (
                    <div 
                      key={col.id} 
                      onMouseMove={handleColumnMouseMove3D}
                      onMouseLeave={handleColumnMouseLeave3D}
                      style={{ 
                        backgroundColor: `${columnVibrantColor}18`, 
                        borderColor: `${columnVibrantColor}60`,
                        boxShadow: `0 20px 45px rgba(0,0,0,0.65), inset 0 0 35px ${columnVibrantColor}0c`
                      }}
                      className={`column-3d-container rounded-2xl border p-4 flex flex-col gap-3.5 w-full md:w-80 md:shrink-0 max-h-[650px] overflow-y-auto ${idx % 2 === 0 ? 'animate-float-3d-odd' : 'animate-float-3d-even'}`}
                    >
                      {/* Column Header (With editable name, instant palette, and deletion options!) */}
                      <div className="flex items-center justify-between border-b border-zinc-850/80 pb-2.5">
                        
                        {editingColumnId === col.id ? (
                          <form 
                            onSubmit={handleEditColumn}
                            className="flex flex-col gap-2 p-2 bg-zinc-950/90 border border-zinc-800 rounded-xl flex-1 animate-scale-up"
                          >
                            <div className="flex items-center gap-1.5 w-full">
                              <input 
                                type="text"
                                value={editColumnTitle}
                                onChange={(e) => setEditColumnTitle(e.target.value)}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-violet-500 w-full"
                                autoFocus
                                required
                              />
                              <button type="submit" className="text-emerald-450 hover:text-emerald-400 text-xs font-black px-1.5 cursor-pointer">OK</button>
                              <button type="button" onClick={() => setEditingColumnId(null)} className="text-zinc-500 hover:text-white text-xs cursor-pointer">X</button>
                            </div>

                            {/* Spectrum Color Selection Row */}
                            <div className="flex flex-col gap-1">
                              <span className="text-[8px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-left">Color de Columna:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {VIBRANT_COLOR_SWATCHES.map((swatch) => (
                                  <button
                                    key={swatch.name}
                                    type="button"
                                    onClick={() => setEditColumnColor(swatch.hex)}
                                    title={swatch.name}
                                    style={{ backgroundColor: swatch.hex }}
                                    className={`w-4 h-4 rounded-full border cursor-pointer transition-all ${
                                      (editColumnColor || columnVibrantColor) === swatch.hex 
                                        ? 'border-white scale-125 shadow-[0_0_8px_rgba(255,255,255,0.6)]' 
                                        : 'border-zinc-800 hover:border-zinc-500 hover:scale-110'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2 group/col relative">
                            <span 
                              className="w-3 h-3 rounded-full shrink-0 shadow-sm" 
                              style={{ backgroundColor: columnVibrantColor }}
                            />
                            <h3 className="font-extrabold text-sm text-white tracking-tight">{col.title}</h3>
                            
                            {/* Rename column pencil */}
                            <button
                              onClick={() => {
                                if (soundEnabled) playPop();
                                setEditingColumnId(col.id);
                                setEditColumnTitle(col.title);
                                setEditColumnColor(col.color || columnVibrantColor);
                              }}
                              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors opacity-60 group-hover/col:opacity-100 cursor-pointer"
                              title="Renombrar columna"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>

                            {/* Instant Color Palette Popover Trigger */}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (soundEnabled) playPop();
                                  setActiveColorPickerColId(activeColorPickerColId === col.id ? null : col.id);
                                }}
                                className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center opacity-70 group-hover/col:opacity-100"
                                title="Cambiar color de columna instantáneamente"
                              >
                                <Palette className="w-3.5 h-3.5" style={{ color: columnVibrantColor }} />
                              </button>

                              {/* Instant Dropdown Popover */}
                              {activeColorPickerColId === col.id && (
                                <div 
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-8 left-0 z-40 p-3 bg-zinc-950 border border-zinc-700/80 rounded-2xl shadow-2xl backdrop-blur-xl w-56 animate-scale-up"
                                >
                                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-zinc-850">
                                    <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                                      Color Vibrante
                                    </span>
                                    <button 
                                      onClick={() => setActiveColorPickerColId(null)}
                                      className="text-zinc-500 hover:text-white p-0.5 cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-4 gap-2">
                                    {VIBRANT_COLOR_SWATCHES.map((swatch) => (
                                      <button
                                        key={swatch.hex}
                                        type="button"
                                        onClick={() => handleQuickSetColumnColor(col.id, swatch.hex)}
                                        title={swatch.name}
                                        style={{ backgroundColor: swatch.hex }}
                                        className={`w-9 h-9 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-center hover:scale-110 active:scale-95 ${
                                          columnVibrantColor.toLowerCase() === swatch.hex.toLowerCase() 
                                            ? 'border-white scale-105 shadow-[0_0_12px_rgba(255,255,255,0.5)]' 
                                            : 'border-white/20 hover:border-white/60'
                                        }`}
                                      >
                                        {columnVibrantColor.toLowerCase() === swatch.hex.toLowerCase() && (
                                          <Check className="w-4 h-4 text-white drop-shadow-md stroke-[3]" />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          <span 
                            className="text-xs font-mono font-black px-2 py-0.5 rounded-md text-white border"
                            style={{ 
                              backgroundColor: `${columnVibrantColor}35`, 
                              borderColor: `${columnVibrantColor}70` 
                            }}
                          >
                            {colTasks.length}
                          </span>

                          {/* Delete column button (available for all columns) */}
                          {(
                            deletingColumnId === col.id ? (
                              <div className="flex items-center gap-1 bg-zinc-950 p-1 border border-rose-900/40 rounded-lg animate-scale-up shrink-0 z-10">
                                <span className="text-[9px] font-bold text-rose-400">¿Borrar?</span>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteColumn(col.id); setDeletingColumnId(null); }}
                                  className="px-1.5 py-0.5 bg-rose-600 text-white text-[9px] font-bold rounded hover:bg-rose-500 cursor-pointer"
                                >
                                  Sí
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setDeletingColumnId(null); }}
                                  className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] font-bold rounded hover:bg-zinc-700 cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); if (soundEnabled) playPop(); setDeletingColumnId(col.id); }}
                                className="text-zinc-550 hover:text-rose-450 transition-colors shrink-0"
                                title="Eliminar esta columna"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Tasks List within Column */}
                      <div className="flex flex-col gap-2.5 min-h-[150px]">
                        {/* Inline Pending Task Creator (Visible at the top of the Pendientes column) */}
                        {col.id === firstColId && (
                          <button
                            type="button"
                            onClick={() => { if (soundEnabled) playPop(); setShowAddTask(true); }}
                            className="w-full py-2.5 bg-zinc-950/60 hover:bg-zinc-900 border border-dashed border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all rounded-xl flex items-center justify-center gap-1.5 cursor-pointer font-bold text-xs shadow-sm mb-1.5"
                          >
                            <Plus className="w-4 h-4 text-violet-400" />
                            <span>Agregar Pendiente</span>
                            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] font-sans font-medium text-violet-400/80 bg-zinc-900 border border-zinc-800 rounded-md">
                              ⇧A
                            </kbd>
                          </button>
                        )}

                        {colTasks.length === 0 ? (
                          <div className="py-6 text-center border border-dashed border-zinc-800/80 rounded-xl bg-zinc-950/20">
                            <p className="text-[11px] text-zinc-500">Vacío</p>
                          </div>
                        ) : (
                          colTasks.map((task) => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              activeColumns={activeColumns}
                              onMove={handleMoveTask} 
                              onDelete={handleDeleteTask} 
                              onEdit={() => {
                                if (soundEnabled) playPop();
                                setEditingTask(task);
                                setEditTaskTitle(task.title);
                                setEditTaskDesc(task.description);
                              }}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Column addition interface */}
                <div className="w-full md:w-80 md:shrink-0">
                  {showAddColumnInput ? (
                    <form 
                      onSubmit={handleAddColumn}
                      className="bg-slate-900/30 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 animate-scale-up"
                    >
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                          Título de Columna
                        </label>
                        <input 
                          type="text"
                          value={newColumnTitle}
                          onChange={(e) => setNewColumnTitle(e.target.value)}
                          placeholder="Ej. Negociando, Cotizando..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                          maxLength={25}
                          autoFocus
                          required
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold"
                        >
                          Crear Columna
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddColumnInput(false)}
                          className="px-2.5 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => { if (soundEnabled) playPop(); setShowAddColumnInput(true); }}
                      className="w-full py-4 border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-900/10 hover:bg-slate-900/20 text-slate-400 hover:text-slate-200 transition-all rounded-2xl flex items-center justify-center gap-2 cursor-pointer font-bold text-xs"
                    >
                      <Plus className="w-4 h-4" />
                      + Agregar Columna
                    </button>
                  )}
                </div>

              </div>
            </div>
          ) : (
            /* INTERACTIVE ANALYTICS PANEL */
            <div key={`${activeSheetId}_${slideDirection}`} className={`flex flex-col gap-4 ${slideDirection === 'right' ? 'animate-slide-right' : 'animate-slide-left'}`}>
              
              <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex flex-col gap-5">
                <div>
                  <h3 className="text-sm font-extrabold text-white mb-1 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-violet-400" />
                    Rendimiento de Tareas
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Resumen interactivo de estados de tus tareas.
                  </p>
                </div>

                {/* Comparative Circular Doughnut Chart */}
                {(() => {
                  const completedPercent = totalTasks > 0 ? (completedTasksCount / totalTasks) : 0;
                  const progressPercent = totalTasks > 0 ? (progressTasksCount / totalTasks) : 0;
                  const pendingPercent = totalTasks > 0 ? (pendingTasksCount / totalTasks) : 0;

                  return (
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 bg-zinc-950/70 p-6 rounded-2xl border border-zinc-800">
                      
                      {/* Interactive Circular Chart SVG */}
                      <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                          {/* Background Ring */}
                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            className="stroke-zinc-900"
                            strokeWidth="10"
                            fill="transparent"
                          />
                          {totalTasks > 0 ? (
                            <>
                              {/* Completed (Emerald) */}
                              <circle
                                cx="60"
                                cy="60"
                                r="50"
                                className="stroke-emerald-500 transition-all duration-500"
                                strokeWidth="10"
                                fill="transparent"
                                strokeDasharray="314.16"
                                strokeDashoffset={314.16 * (1 - completedPercent)}
                              />
                              {/* In Progress (Amber) */}
                              <circle
                                cx="60"
                                cy="60"
                                r="50"
                                className="stroke-amber-500 transition-all duration-500"
                                strokeWidth="10"
                                fill="transparent"
                                strokeDasharray="314.16"
                                strokeDashoffset={314.16 * (1 - progressPercent)}
                                transform={`rotate(${completedPercent * 360} 60 60)`}
                              />
                              {/* Pending (Rose) */}
                              <circle
                                cx="60"
                                cy="60"
                                r="50"
                                className="stroke-rose-500 transition-all duration-500"
                                strokeWidth="10"
                                fill="transparent"
                                strokeDasharray="314.16"
                                strokeDashoffset={314.16 * (1 - pendingPercent)}
                                transform={`rotate(${(completedPercent + progressPercent) * 360} 60 60)`}
                              />
                            </>
                          ) : null}
                        </svg>
                        
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-mono font-black text-white tabular-nums">{totalTasks}</span>
                          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Tareas</span>
                        </div>
                      </div>

                      {/* Side Legend with detailed breakdown and counts */}
                      <div className="flex flex-col gap-3.5 flex-1 w-full">
                        <h4 className="text-[10px] font-display tracking-wider font-extrabold text-zinc-400 uppercase">
                          Distribución de Pendientes
                        </h4>
                        
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-850 hover:border-zinc-800 transition-colors">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                              <span className="text-xs font-semibold text-zinc-200">Pendientes</span>
                            </div>
                            <div className="text-xs font-mono font-extrabold text-zinc-350">
                              {pendingTasksCount} <span className="text-[10px] font-normal text-zinc-500">({Math.round(pendingPercent * 100)}%)</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-850 hover:border-zinc-800 transition-colors">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                              <span className="text-xs font-semibold text-zinc-200">En Proceso</span>
                            </div>
                            <div className="text-xs font-mono font-extrabold text-zinc-350">
                              {progressTasksCount} <span className="text-[10px] font-normal text-zinc-500">({Math.round(progressPercent * 100)}%)</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-zinc-850 hover:border-zinc-800 transition-colors">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                              <span className="text-xs font-semibold text-zinc-200">Completados</span>
                            </div>
                            <div className="text-xs font-mono font-extrabold text-zinc-350">
                              {completedTasksCount} <span className="text-[10px] font-normal text-zinc-500">({Math.round(completedPercent * 100)}%)</span>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })()}

                {/* Complete Percentage bar gauge */}
                <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-zinc-300">Eficiencia de la Hoja Activa</span>
                    <span className="text-xs font-mono font-bold text-violet-400">
                      {totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0}% completado
                    </span>
                  </div>
                  <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-violet-500 via-purple-500 to-emerald-500 h-full rounded-full transition-all duration-700"
                      style={{ width: `${totalTasks > 0 ? (completedTasksCount / totalTasks) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Medals tracker board */}
              <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-white mb-1 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-emerald-400" />
                    Estado de Hojas
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Completa todo para ganar oro.
                  </p>
                </div>

                <div className="space-y-2">
                  {sheets.map(sheet => {
                    const stats = sheetStats[sheet.id] || { total: 0, completed: 0, pending: 0, progress: 0 };
                    const isCompleted = stats.total > 0 && stats.pending === 0 && stats.progress === 0;
                    const rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

                    return (
                      <div 
                        key={sheet.id}
                        className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all ${sheet.id === activeSheetId ? 'bg-violet-950/15 border-violet-900/40' : 'bg-zinc-950/30 border-zinc-800'}`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-display tracking-widest uppercase font-extrabold text-zinc-200 truncate max-w-[150px]">
                            {sheet.title}
                          </span>
                          
                          {isCompleted ? (
                            <span className="text-[9px] font-bold text-amber-300 bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              Oro ganado
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-slate-500">
                              {stats.completed}/{stats.total} tareas
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-900 h-1 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${isCompleted ? 'bg-amber-400' : 'bg-violet-500'}`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-slate-400">{rate}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )
        )}
        </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 py-5 bg-[#05070e] text-center mt-10">
        <p className="text-slate-600 text-[10px] font-mono">
          TaskPro · Optimizado para mobile y escritorio
        </p>
      </footer>

      {/* MODAL: Edit Sheet Name (No Emojis!) */}
      {editingSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={handleEditSheet} className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5 relative shadow-2xl animate-scale-up text-white">
            <button 
              type="button"
              onClick={() => { if (soundEnabled) playPop(); setEditingSheet(null); }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-extrabold text-white mb-2 tracking-tight">
              Editar Hoja
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-zinc-450 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Nombre de la Hoja
                </label>
                <input 
                  type="text" 
                  value={editSheetTitle}
                  onChange={(e) => setEditSheetTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                  maxLength={20}
                  required
                />
              </div>
            </div>

            <div className="pt-4 flex gap-2">
              <button 
                type="button"
                onClick={() => { if (soundEnabled) playPop(); setEditingSheet(null); }}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-violet-600/10"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: AI VOICE ASSISTANT */}
      {isVoiceAssistantOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl w-full max-w-md p-6 relative shadow-[0_20px_50px_rgba(99,102,241,0.2)] animate-scale-up text-white flex flex-col gap-5 overflow-hidden">
            <button 
              type="button"
              onClick={() => { if (soundEnabled) playPop(); setIsVoiceAssistantOpen(false); handleStopVoiceRecognition(); }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-violet-600/20 border border-violet-500/30 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.15)] flex items-center justify-center text-violet-400">
                <Mic className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h3 className="text-base font-extrabold text-white tracking-tight">
                  Control de Voz Inteligente IA
                </h3>
                <p className="text-[10px] text-zinc-400">
                  Controla tu tablero 3D con comandos de voz naturales.
                </p>
              </div>
            </div>

            {/* Glowing active micro visualizer */}
            <div className="flex flex-col items-center justify-center py-6 bg-zinc-950/40 border border-zinc-850/60 rounded-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-radial-gradient from-violet-600/5 to-transparent opacity-40 pointer-events-none" />
              
              <button
                type="button"
                onClick={isListening ? handleStopVoiceRecognition : handleStartVoiceRecognition}
                disabled={isVoiceProcessing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer ${
                  isListening 
                    ? 'bg-rose-600 shadow-[0_0_35px_rgba(225,29,72,0.65)] animate-pulse' 
                    : isVoiceProcessing
                      ? 'bg-zinc-800 opacity-50 cursor-not-allowed'
                      : 'bg-violet-600 hover:bg-violet-500 shadow-[0_0_25px_rgba(99,102,241,0.4)]'
                }`}
              >
                {isListening ? (
                  <MicOff className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </button>

              <div className="text-center mt-4 min-h-[40px] px-4">
                {isListening ? (
                  <span className="text-xs font-mono text-rose-450 font-bold animate-pulse">
                    Escuchando voz... Habla ahora
                  </span>
                ) : isVoiceProcessing ? (
                  <div className="flex items-center gap-1.5 justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="text-xs font-mono text-violet-400 font-bold">IA interpretando comandos...</span>
                  </div>
                ) : (
                  <span className="text-xs font-mono text-zinc-400">
                    Toca el micrófono para hablar
                  </span>
                )}
              </div>
            </div>

            {/* Live transcription feedback and Accept & Execute controls */}
            {voiceText && (
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/80 animate-fade-in flex flex-col gap-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    Transcripción rápida
                  </span>
                  <span className="text-[9px] text-zinc-500 font-mono">Toca para editar si lo deseas</span>
                </div>
                
                <textarea
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  placeholder="El comando de voz aparecerá aquí..."
                  rows={2}
                  className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-violet-500/80 w-full min-h-[55px] font-medium leading-relaxed resize-none"
                />

                {!isVoiceProcessing && (
                  <button
                    onClick={async () => {
                      if (soundEnabled) playPop();
                      await processVoiceCommand(voiceText);
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer animate-pulse"
                  >
                    <Check className="w-4 h-4 text-white stroke-[3]" />
                    <span>Aceptar y Ejecutar Comando</span>
                  </button>
                )}
              </div>
            )}

            {/* Success or Feedback read back */}
            {voiceSuccessMessage && (
              <div className="bg-emerald-950/20 border border-emerald-900/40 p-3.5 rounded-xl animate-fade-in flex flex-col gap-1 text-left">
                <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-wider">Acción Realizada</span>
                <p className="text-xs text-zinc-300 leading-normal font-sans font-semibold">
                  {voiceSuccessMessage}
                </p>
              </div>
            )}

            {/* Errors if any */}
            {voiceError && (
              <div className="bg-rose-950/30 border border-rose-900/40 p-3.5 rounded-xl animate-fade-in flex items-center gap-2 text-rose-400 text-left">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-semibold leading-snug">{voiceError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Mobile Sheets Drawer / Selector */}
      {showMobileSheetsDrawer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[85vh] p-5 relative shadow-2xl animate-scale-up text-white flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-violet-600/20 text-violet-400 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Mis Hojas</h3>
                  <p className="text-[10px] text-zinc-400">Selecciona o administra tus tableros</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => { if (soundEnabled) playPop(); setShowMobileSheetsDrawer(false); }}
                className="p-1 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of sheets */}
            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[50vh] pr-1">
              {sheets.map((sheet) => {
                const stats = sheetStats[sheet.id] || { total: 0, completed: 0, pending: 0, progress: 0 };
                const isCompleted = stats.total > 0 && stats.pending === 0 && stats.progress === 0;
                const isActive = activeSheetId === sheet.id;

                return (
                  <div
                    key={sheet.id}
                    onClick={() => {
                      if (soundEnabled) playPop();
                      setActiveSheetId(sheet.id);
                      setShowMobileSheetsDrawer(false);
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isActive 
                        ? 'bg-violet-600/20 border-violet-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                        : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <Layers className="w-5 h-5 text-violet-400 shrink-0" />
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>
                            {sheet.title}
                          </span>
                          {isCompleted && (
                            <span className="text-[9px] font-bold text-amber-400 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded">
                              Completada
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {stats.total} {stats.total === 1 ? 'tarea' : 'tareas'} · {stats.completed} listas
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          if (soundEnabled) playPop();
                          setEditingSheet(sheet);
                          setEditSheetTitle(sheet.title);
                          setShowMobileSheetsDrawer(false);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                        title="Editar hoja"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {sheets.length > 1 && (
                        <button
                          onClick={() => {
                            if (soundEnabled) playPop();
                            handleDeleteSheet(sheet.id);
                          }}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400"
                          title="Eliminar hoja"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick add sheet inside drawer */}
            <div className="pt-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  if (soundEnabled) playPop();
                  setShowMobileSheetsDrawer(false);
                  setShowAddSheetInput(true);
                }}
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-violet-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Nueva Hoja</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Task Details */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={handleEditTask} className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5 relative shadow-2xl animate-scale-up text-white">
            <button 
              type="button"
              onClick={() => { if (soundEnabled) playPop(); setEditingTask(null); }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-extrabold text-white mb-2 tracking-tight">
              Editar Pendiente
            </h3>

            <div className="space-y-3.5">
              <div>
                <label className="block text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Título del Pendiente *
                </label>
                <input 
                  type="text" 
                  value={editTaskTitle}
                  onChange={(e) => setEditTaskTitle(e.target.value)}
                  maxLength={150}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 placeholder:text-zinc-650"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Descripción (Opcional)
                </label>
                <textarea 
                  value={editTaskDesc}
                  onChange={(e) => setEditTaskDesc(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 resize-none placeholder:text-zinc-650"
                />
              </div>
            </div>

            <div className="pt-4 flex gap-2">
              <button 
                type="button"
                onClick={() => { if (soundEnabled) playPop(); setEditingTask(null); }}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Add New Task */}
      {showAddTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={handleAddTask} className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5 relative shadow-2xl animate-scale-up text-white">
            <button 
              type="button"
              onClick={() => { if (soundEnabled) playPop(); setShowAddTask(false); }}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-extrabold text-white mb-1 tracking-tight">
              Crear Nuevo Pendiente
            </h3>
            <p className="text-[11px] text-zinc-400 mb-4">
              Cada tarea vale exactamente <strong className="text-amber-300">1 XP</strong> al completarse en la pestaña activa.
            </p>

            {formError && (
              <div className="p-2.5 bg-rose-950/50 border border-rose-900/40 rounded-xl text-rose-300 text-[11px] flex items-center gap-1.5 mb-3">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="block text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Título de la Tarea *
                </label>
                <input 
                  type="text" 
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  maxLength={150}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 placeholder:text-zinc-600"
                  placeholder="Ej. Comprar materiales..."
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Descripción (Opcional)
                </label>
                <textarea 
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500 placeholder:text-zinc-650 resize-none"
                  placeholder="Detalles sobre la tarea..."
                />
              </div>
            </div>

            <div className="pt-4 flex gap-2">
              <button 
                type="button"
                onClick={() => { if (soundEnabled) playPop(); setShowAddTask(false); }}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-violet-600/10 cursor-pointer"
              >
                Crear
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: 3D Congratulations Celebration Overlay Canvas */}
      {celebrationTask && (
        <InteractiveCongrats3D 
          taskTitle={celebrationTask.title}
          points={celebrationTask.points}
          onClose={() => { if (soundEnabled) playPop(); setCelebrationTask(null); }}
        />
      )}

      {/* MOBILE FLOATING ADD BUTTON */}
      <button
        onClick={() => { if (soundEnabled) playPop(); setShowAddTask(true); }}
        className="fixed bottom-6 right-6 z-40 md:hidden flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-violet-600 via-violet-500 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-full shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_25px_rgba(99,102,241,0.6)] cursor-pointer transition-all active:scale-95 animate-pulse animate-float-slow"
        title="Agregar nuevo pendiente"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* MOBILE FLOATING VOICE ASSISTANT BUTTON (OPPOSITE CORNER) */}
      <button
        onClick={() => { if (soundEnabled) playPop(); setIsVoiceAssistantOpen(true); }}
        className="fixed bottom-6 left-6 z-40 md:hidden flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-violet-600 via-violet-500 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-full shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_25px_rgba(99,102,241,0.6)] cursor-pointer transition-all active:scale-95 animate-pulse animate-float-slow"
        title="Asistente de Voz IA"
      >
        <Mic className="w-6 h-6 animate-pulse" />
      </button>

    </div>
  );
}

// Sub-component for individual task cards (Glossy Cyberpunk Neon Style with Editing option!)
interface TaskCardProps {
  task: Task;
  activeColumns: KanbanColumn[];
  onMove: (task: Task, direction: 'left' | 'right') => void;
  onDelete: (task: Task) => void;
  onEdit: () => void;
}

function TaskCard({ task, activeColumns, onMove, onDelete, onEdit }: TaskCardProps) {
  const currentIndex = activeColumns.findIndex(c => c.id === task.column);
  const lastColId = activeColumns[activeColumns.length - 1]?.id || 'done';

  // Real-time mouse and touch sliding offsets
  const [dragOffset, setDragOffset] = useState(0);
  const startX = useRef(0);
  const isDraggingCard = useRef(false);

  const handleStart = (clientX: number) => {
    startX.current = clientX;
    isDraggingCard.current = true;
  };

  const handleMove = (clientX: number) => {
    if (!isDraggingCard.current) return;
    const offset = clientX - startX.current;
    setDragOffset(offset);
  };

  const handleEnd = () => {
    if (!isDraggingCard.current) return;
    isDraggingCard.current = false;
    
    if (dragOffset > 75) {
      if (currentIndex < activeColumns.length - 1) {
        onMove(task, 'right');
      }
    } else if (dragOffset < -75) {
      if (currentIndex > 0) {
        onMove(task, 'left');
      }
    }
    setDragOffset(0);
  };

  const parentColumn = activeColumns[currentIndex];
  const cardVibrantColor = getColumnVibrantColor(parentColumn, currentIndex);

  return (
    <div 
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => { 
        if (window.innerWidth < 768) return; // Disable touch-sliding completely on mobile!
        if (e.touches.length > 0) handleStart(e.touches[0].clientX); 
      }}
      onTouchMove={(e) => { 
        if (window.innerWidth < 768) return; // Disable touch-sliding completely on mobile!
        if (e.touches.length > 0) handleMove(e.touches[0].clientX); 
      }}
      onTouchEnd={() => {
        if (window.innerWidth < 768) return; // Disable touch-sliding completely on mobile!
        handleEnd();
      }}
      style={{
        transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.04}deg)`,
        transition: isDraggingCard.current ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: isDraggingCard.current ? 'grabbing' : 'grab',
        borderColor: `${cardVibrantColor}75`,
        backgroundColor: `${cardVibrantColor}28`,
        boxShadow: `0 10px 25px -6px ${cardVibrantColor}55, inset 0 0 16px ${cardVibrantColor}18`
      }}
      className="task-card-3d p-4 rounded-xl border hover:border-white/80 shadow-md hover:-translate-y-1 transform group flex flex-col gap-3 relative select-none touch-none min-h-[110px] h-auto flex-shrink-0"
    >
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold font-mono tracking-wider" style={{ color: cardVibrantColor }}>
          <CircleDot className="w-3.5 h-3.5" style={{ color: cardVibrantColor }} />
          <span>Pendiente</span>
        </div>
        {task.column === lastColId && (
          <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded">
            +1 XP
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-extrabold text-sm text-zinc-100 transition-colors leading-relaxed break-words whitespace-normal py-0.5">
          {task.title}
        </h4>
        {task.description && (
          <p className="text-[11px] text-zinc-300/90 leading-relaxed mt-1 break-words whitespace-normal">
            {task.description}
          </p>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end border-t border-slate-800/40 pt-2 mt-1 gap-2">
        
        {/* Edit task pencil */}
        <button
          onClick={onEdit}
          className="p-1 text-slate-500 hover:text-violet-400 hover:bg-violet-950/30 rounded transition-all cursor-pointer"
          title="Editar pendiente"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {/* Delete task */}
        <button
          onClick={() => onDelete(task)}
          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 rounded transition-all cursor-pointer"
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Move left */}
        {currentIndex > 0 && (
          <button
            onClick={() => onMove(task, 'left')}
            className="p-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded transition-all cursor-pointer"
            title="Mover atrás"
          >
            <ArrowLeft className="w-3 h-3" />
          </button>
        )}

        {/* Move right */}
        {currentIndex < activeColumns.length - 1 && (
          <button
            onClick={() => onMove(task, 'right')}
            className="p-1 text-white bg-violet-600 hover:bg-violet-500 rounded transition-all flex items-center gap-0.5 cursor-pointer"
            title={currentIndex === activeColumns.length - 2 ? "Completar" : "Avanzar"}
          >
            <span className="text-[9px] font-bold px-0.5">
              {currentIndex === activeColumns.length - 2 ? 'Listo!' : 'Avanzar'}
            </span>
            {currentIndex === activeColumns.length - 2 ? <Check className="w-2.5 h-2.5" /> : <ArrowRight className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>

      {task.column === lastColId && (
        <div className="absolute top-0 right-0 w-10 h-10 overflow-hidden pointer-events-none">
          <div className="bg-emerald-500/10 text-emerald-400 text-[7px] font-bold uppercase text-center rotate-45 translate-x-3 translate-y-1 py-0.5 border border-emerald-500/20">
            OK
          </div>
        </div>
      )}
    </div>
  );
}

// 3D Canvas Celebration Component (Projection Matrix + Particle Physics Engine)
interface InteractiveCongrats3DProps {
  taskTitle: string;
  points: number;
  onClose: () => void;
}

function InteractiveCongrats3D({ taskTitle, points, onClose }: InteractiveCongrats3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const particles = useRef<Particle3D[]>([]);
  
  const angleY = useRef(0.01);
  const angleX = useRef(0.005);
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);
  const lastMouseY = useRef(0);

  useEffect(() => {
    const pList: Particle3D[] = [];
    const colors = [
      '#6366f1', // Violet
      '#a855f7', // Purple
      '#ec4899', // Pink
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#06b6d4'  // Cyan
    ];
    const types: ('cube' | 'star' | 'diamond' | 'sphere')[] = ['cube', 'star', 'diamond', 'sphere'];

    for (let i = 0; i < 90; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const dist = 50 + Math.random() * 180;

      pList.push({
        x: dist * Math.sin(phi) * Math.cos(theta),
        y: dist * Math.sin(phi) * Math.sin(theta),
        z: dist * Math.cos(phi),
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        vz: (Math.random() - 0.5) * 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 5 + Math.random() * 12,
        type: types[Math.floor(Math.random() * types.length)],
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotZ: Math.random() * Math.PI,
        rotSpeedX: (Math.random() - 0.5) * 0.05,
        rotSpeedY: (Math.random() - 0.5) * 0.05,
        rotSpeedZ: (Math.random() - 0.5) * 0.05
      });
    }
    particles.current = pList;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const focalLength = 350;

    const render = () => {
      ctx.fillStyle = 'rgba(7, 11, 20, 0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      const cosY = Math.cos(angleY.current);
      const sinY = Math.sin(angleY.current);
      const cosX = Math.cos(angleX.current);
      const sinX = Math.sin(angleX.current);

      particles.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        const d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (d > 250) {
          p.vx *= -1;
          p.vy *= -1;
          p.vz *= -1;
        }

        let x1 = p.x * cosY - p.z * sinY;
        let z1 = p.z * cosY + p.x * sinY;
        let y2 = p.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + p.y * sinX;

        p.rotX += p.rotSpeedX;
        p.rotY += p.rotSpeedY;
        p.rotZ += p.rotSpeedZ;

        const scale = focalLength / (focalLength + z2);
        const projX = cx + x1 * scale;
        const projY = cy + y2 * scale;

        if (z2 + focalLength > 10 && projX > 0 && projX < canvas.width && projY > 0 && projY < canvas.height) {
          const opacity = Math.min(1, Math.max(0.15, (focalLength - z2) / (focalLength * 1.5)));
          ctx.strokeStyle = p.color;
          ctx.fillStyle = p.color;
          ctx.lineWidth = 1.5;

          ctx.save();
          ctx.translate(projX, projY);
          ctx.scale(scale, scale);
          ctx.rotate(p.rotZ);

          if (p.type === 'cube') {
            const sz = p.size;
            ctx.globalAlpha = opacity * 0.4;
            ctx.fillRect(-sz/2, -sz/2, sz, sz);
            ctx.globalAlpha = opacity;
            ctx.strokeRect(-sz/2, -sz/2, sz, sz);
          } else if (p.type === 'star') {
            ctx.globalAlpha = opacity;
            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
              ctx.lineTo(Math.cos((18 + j * 72) * Math.PI / 180) * p.size, Math.sin((18 + j * 72) * Math.PI / 180) * p.size);
              ctx.lineTo(Math.cos((54 + j * 72) * Math.PI / 180) * (p.size / 2.5), Math.sin((54 + j * 72) * Math.PI / 180) * (p.size / 2.5));
            }
            ctx.closePath();
            ctx.fill();
          } else if (p.type === 'diamond') {
            ctx.globalAlpha = opacity;
            ctx.beginPath();
            ctx.moveTo(0, -p.size);
            ctx.lineTo(p.size / 1.5, 0);
            ctx.lineTo(0, p.size);
            ctx.lineTo(-p.size / 1.5, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.globalAlpha = opacity * 0.3;
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = opacity;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      });

      if (!isDragging.current) {
        angleY.current *= 0.98;
        angleX.current *= 0.98;
        if (Math.abs(angleY.current) < 0.005) angleY.current = 0.003;
        if (Math.abs(angleX.current) < 0.003) angleX.current = 0.002;
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouseX.current = e.clientX;
    lastMouseY.current = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - lastMouseX.current;
    const deltaY = e.clientY - lastMouseY.current;

    angleY.current = deltaX * 0.005;
    angleX.current = deltaY * 0.005;

    lastMouseX.current = e.clientX;
    lastMouseY.current = e.clientY;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    isDragging.current = true;
    lastMouseX.current = e.touches[0].clientX;
    lastMouseY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || e.touches.length === 0) return;
    const deltaX = e.touches[0].clientX - lastMouseX.current;
    const deltaY = e.touches[0].clientY - lastMouseY.current;

    angleY.current = deltaX * 0.006;
    angleX.current = deltaY * 0.006;

    lastMouseX.current = e.touches[0].clientX;
    lastMouseY.current = e.touches[0].clientY;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 overflow-hidden select-none bg-[#03060c]/90"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing block"
      />

      <div className="relative bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 p-8 rounded-3xl w-full max-w-md text-center shadow-2xl flex flex-col items-center gap-6 pointer-events-auto">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-violet-500 flex items-center justify-center shadow-xl shadow-emerald-500/25 animate-bounce">
          <Award className="w-8 h-8 text-white" />
        </div>

        <div>
          <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase bg-emerald-950/50 border border-emerald-800/30 px-3 py-1 rounded-full">
            ¡Completado con Éxito!
          </span>
          <h2 className="text-2xl font-display font-extrabold text-white mt-4 tracking-tight leading-tight">
            ¡Excelente Trabajo!
          </h2>
          <p className="text-slate-400 text-xs mt-2 font-mono max-w-sm truncate" title={taskTitle}>
            "{taskTitle}"
          </p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-6 py-4 flex flex-col items-center justify-center gap-1 w-full">
          <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Premio Obtenido</div>
          <div className="text-3xl font-mono font-extrabold text-amber-300">+1 XP</div>
          <div className="text-[10px] text-slate-400">Punto agregado a la hoja</div>
        </div>

        <p className="text-[10px] text-slate-500 italic">
          Tip: ¡Desliza el dedo en la pantalla para girar las estrellas 3D en el espacio!
        </p>

        <button 
          onClick={onClose}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-600/25 cursor-pointer"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

// Sub-component for individual sheet tabs with mouse & touch drag sliding to organize them
interface SheetTabProps {
  sheet: Sheet;
  idx: number;
  sheetsCount: number;
  isActive: boolean;
  isCompleted: boolean;
  onSelect: () => void;
  onMove: (sheetId: string, direction: 'left' | 'right') => void;
  onEdit: () => void;
  deletingSheetId: string | null;
  setDeletingSheetId: (id: string | null) => void;
  handleDeleteSheet: (id: string) => void;
}

function SheetTab({ 
  sheet, 
  idx, 
  sheetsCount, 
  isActive, 
  isCompleted, 
  onSelect, 
  onMove, 
  onEdit, 
  deletingSheetId, 
  setDeletingSheetId, 
  handleDeleteSheet 
}: SheetTabProps) {
  const [dragOffset, setDragOffset] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);

  const handleStart = (clientX: number) => {
    startX.current = clientX;
    isDragging.current = true;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging.current) return;
    const offset = clientX - startX.current;
    // Allow dragging with bounded range
    setDragOffset(Math.max(-120, Math.min(120, offset)));
  };

  const handleEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (dragOffset > 60) {
      if (idx < sheetsCount - 1) {
        onMove(sheet.id, 'right');
      }
    } else if (dragOffset < -60) {
      if (idx > 0) {
        onMove(sheet.id, 'left');
      }
    }
    setDragOffset(0);
  };

  return (
    <div 
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => { if (e.touches.length > 0) handleStart(e.touches[0].clientX); }}
      onTouchMove={(e) => { if (e.touches.length > 0) handleMove(e.touches[0].clientX); }}
      onTouchEnd={handleEnd}
      style={{
        transform: `translateX(${dragOffset}px)`,
        transition: isDragging.current ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: isDragging.current ? 'grabbing' : 'grab'
      }}
      className={`relative group shrink-0 select-none touch-none`}
    >
      <div
        onClick={() => {
          if (!isActive && !isDragging.current) {
            onSelect();
          }
        }}
        className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-t-xl transition-all border-t border-x cursor-pointer whitespace-nowrap ${isActive ? 'bg-[#0c0c0e] border-zinc-800 text-violet-400 font-bold -mb-px shadow-[0_-4px_12px_rgba(0,0,0,0.3)]' : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200'}`}
      >
        <span className="font-sans font-semibold text-xs sm:text-sm">{sheet.title}</span>

        {isCompleted && (
          <span className="text-[10px] font-bold text-emerald-400 shrink-0" title="¡Medalla ganada!">Completado</span>
        )}

        {/* Edit sheet pencil button */}
        {isActive && (
          <span 
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="ml-1 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-violet-400 transition-colors shrink-0 cursor-pointer"
            title="Editar nombre de esta hoja"
          >
            <Pencil className="w-3 h-3" />
          </span>
        )}

        {/* Delete Sheet */}
        {(
          deletingSheetId === sheet.id ? (
            <span className="ml-1.5 flex items-center gap-1 bg-zinc-950 p-1 border border-rose-900/40 rounded-lg animate-scale-up text-[9px] shrink-0 z-10">
              <span className="text-rose-450 font-bold">¿Borrar?</span>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDeleteSheet(sheet.id); setDeletingSheetId(null); }}
                className="px-1 py-0.5 bg-rose-600 text-white rounded font-bold cursor-pointer"
              >
                Sí
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setDeletingSheetId(null); }}
                className="px-1 py-0.5 bg-zinc-800 text-zinc-400 rounded font-bold cursor-pointer"
              >
                No
              </button>
            </span>
          ) : (
            <span 
              onClick={(e) => { e.stopPropagation(); setDeletingSheetId(sheet.id); }}
              className="ml-1 p-0.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-rose-450 transition-colors shrink-0 cursor-pointer"
              title="Eliminar esta hoja"
            >
              <X className="w-2.5 h-2.5" />
            </span>
          )
        )}
      </div>
    </div>
  );
}
