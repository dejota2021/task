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
  Settings
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from './firebase';
import { playPop, playWoosh, playSuccess, playFanfare } from './sound';

// Column Interface (Fully Dynamic!)
interface KanbanColumn {
  id: string;
  title: string;
}

// Board Sheet Interface
interface Sheet {
  id: string;
  title: string;
  emoji: string;
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

// Pre-defined productivity emojis list
const FUN_EMOJIS = ['🎯', '💼', '🏠', '🚀', '🎨', '🔥', '📚', '🍕', '🎮', '💡', '🏆', '⭐', '🍀', '🛠️', '✈️'];

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
  const [newSheetEmoji, setNewSheetEmoji] = useState('');

  // Edit sheet modal form
  const [editingSheet, setEditingSheet] = useState<Sheet | null>(null);
  const [editSheetTitle, setEditSheetTitle] = useState('');
  const [editSheetEmoji, setEditSheetEmoji] = useState('');

  // Edit task modal form
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');

  // Column creation and edit form
  const [showAddColumnInput, setShowAddColumnInput] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editColumnTitle, setEditColumnTitle] = useState('');
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
          emoji: '',
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

    if (isOfflineFallback) {
      loadLocalTasksBackup();
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
      emoji: newSheetEmoji,
      createdAt: Date.now(),
      columns: DEFAULT_COLUMNS,
      order: sheets.length
    };

    const updatedSheets = [...sheets, newSheet];
    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    setActiveSheetId(newId);
    setNewSheetTitle('');
    setNewSheetEmoji('🎯');
    setShowAddSheetInput(false);

    if (isOfflineFallback) return;

    try {
      await setDoc(doc(db, 'boards', newId), {
        title: title,
        emoji: newSheet.emoji,
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
    const emoji = editSheetEmoji;

    const updatedSheets = sheets.map(s => {
      if (s.id === editingSheet.id) {
        return { ...s, title, emoji };
      }
      return s;
    });

    setSheets(updatedSheets);
    localStorage.setItem('sincrotask_sheets_list', JSON.stringify(updatedSheets));
    setEditingSheet(null);

    if (isOfflineFallback) return;

    try {
      await updateDoc(doc(db, 'boards', editingSheet.id), {
        title: title,
        emoji: emoji
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

  // Rename a Column
  const handleEditColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColumnId || !editColumnTitle.trim()) return;

    if (soundEnabled) playPop();

    const updatedColumns = activeColumns.map(c => {
      if (c.id === editingColumnId) {
        return { ...c, title: editColumnTitle.trim() };
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

    if (isOfflineFallback) return;

    try {
      await updateDoc(doc(db, 'boards', activeSheetId), {
        columns: updatedColumns
      });
    } catch (err) {
      console.warn("Failed to rename column online:", err);
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
            <div className="p-2 bg-indigo-600/10 border border-indigo-500/30 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.2)] flex items-center justify-center transition-all duration-300 hover:border-indigo-400/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <ListTodo className="w-5 h-5 text-indigo-400 filter drop-shadow-[0_0_4px_rgba(99,102,241,0.5)] cursor-pointer" />
            </div>
          </div>

          {/* Quick toggle view */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800/60">
            <button
              onClick={() => { if (soundEnabled) playPop(); setActiveView('board'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeView === 'board' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Tablero
            </button>
            <button
              onClick={() => { if (soundEnabled) playPop(); setActiveView('analytics'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeView === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Analíticas
            </button>
          </div>

          <div className="flex items-center gap-2">
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
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-5 shadow-[0_0_30px_rgba(99,102,241,0.15)] animate-bounce">
              <ListTodo className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-extrabold text-white mb-2">No hay hojas creadas</h3>
            <p className="text-zinc-400 text-xs max-w-sm mb-6">
              Organiza tus pendientes creando una hoja colaborativa. Podrás agregar columnas personalizadas y tareas con efectos 3D.
            </p>
            {showAddSheetInput ? (
              <form onSubmit={handleAddSheet} className="flex flex-col sm:flex-row items-center gap-2.5 p-3 bg-zinc-950 border border-zinc-800 rounded-2xl animate-scale-up shadow-2xl max-w-md w-full">
                <div className="flex items-center gap-2 flex-1 w-full">
                  <span className="text-xl p-1 bg-zinc-900 border border-zinc-800 rounded-lg shrink-0">{newSheetEmoji}</span>
                  <input 
                    type="text" 
                    value={newSheetTitle}
                    onChange={(e) => setNewSheetTitle(e.target.value)}
                    placeholder="Nombre de tu primera hoja..."
                    maxLength={20}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-indigo-500 text-white placeholder:text-zinc-500 flex-1 w-full"
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
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    Crear Hoja
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => { if (soundEnabled) playPop(); setShowAddSheetInput(true); }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 cursor-pointer flex items-center gap-2"
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
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] text-zinc-400 font-bold uppercase truncate">Listos</div>
              <div className="text-sm sm:text-base font-mono font-black text-indigo-300">{completedTasksCount}</div>
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

        {/* MULTI-SHEET / BOARD TABS SELECTOR BAR - Dynamic swipable dark list */}
        <div className="border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-2.5 flex-1 -mb-px sheet-tabs-scrollbar">
            {sheets.map((sheet, idx) => {
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
                    setEditSheetEmoji(sheet.emoji);
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
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500 text-white placeholder:text-zinc-600 w-32"
                  autoFocus
                  required
                />
                <button 
                  type="submit"
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer"
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
                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                <span className="font-sans font-semibold text-xs">Nueva Hoja</span>
              </button>
            )}
          </div>
        </div>

        {/* LOADING SHIM */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-800 rounded-2xl">
            <div className="w-8 h-8 rounded-full border-3 border-indigo-500/20 border-t-indigo-500 animate-spin mb-3" />
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

                  return (
                    <div 
                      key={col.id} 
                      className={`column-3d-container rounded-2xl bg-zinc-900/45 border border-zinc-800/80 p-4 flex flex-col gap-3.5 w-full md:w-80 md:shrink-0 max-h-[650px] overflow-y-auto shadow-[0_20px_45px_rgba(0,0,0,0.85)] ${idx % 2 === 0 ? 'animate-float-3d-odd' : 'animate-float-3d-even'}`}
                    >
                      {/* Column Header (With editable name and deletion options!) */}
                      <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5">
                        
                        {editingColumnId === col.id ? (
                          <form 
                            onSubmit={handleEditColumn}
                            className="flex items-center gap-1.5 flex-1"
                          >
                            <input 
                              type="text"
                              value={editColumnTitle}
                              onChange={(e) => setEditColumnTitle(e.target.value)}
                              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                              autoFocus
                              required
                            />
                            <button type="submit" className="text-emerald-400 text-xs font-bold px-1">Ok</button>
                            <button type="button" onClick={() => setEditingColumnId(null)} className="text-zinc-400 text-xs">x</button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2 group/col">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500/70" />
                            <h3 className="font-extrabold text-sm text-zinc-200">{col.title}</h3>
                            
                            {/* Rename column pencil */}
                            <button
                              onClick={() => {
                                if (soundEnabled) playPop();
                                setEditingColumnId(col.id);
                                setEditColumnTitle(col.title);
                              }}
                              className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-indigo-400 transition-colors opacity-0 group-hover/col:opacity-100"
                              title="Renombrar columna"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-mono font-bold bg-zinc-800 px-2 py-0.5 rounded-md text-zinc-400">
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
                            <Plus className="w-4 h-4 text-indigo-400" />
                            <span>Agregar Pendiente</span>
                            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] font-sans font-medium text-indigo-400/80 bg-zinc-900 border border-zinc-800 rounded-md">
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
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                          maxLength={25}
                          autoFocus
                          required
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
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
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
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
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      {totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0}% completado
                    </span>
                  </div>
                  <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 h-full rounded-full transition-all duration-700"
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
                        className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all ${sheet.id === activeSheetId ? 'bg-indigo-950/15 border-indigo-900/40' : 'bg-zinc-950/30 border-zinc-800'}`}
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
                              className={`h-full rounded-full ${isCompleted ? 'bg-amber-400' : 'bg-indigo-500'}`}
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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/10"
              >
                Guardar
              </button>
            </div>
          </form>
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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-650"
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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none placeholder:text-zinc-650"
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
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg"
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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-zinc-650 resize-none"
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
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/10 cursor-pointer"
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
        className="fixed bottom-6 right-6 z-40 md:hidden flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_25px_rgba(99,102,241,0.6)] cursor-pointer transition-all active:scale-95 animate-pulse animate-float-slow"
        title="Agregar nuevo pendiente"
      >
        <Plus className="w-7 h-7" />
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
        transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.04}deg)`,
        transition: isDraggingCard.current ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: isDraggingCard.current ? 'grabbing' : 'grab'
      }}
      className={`task-card-3d p-3.5 rounded-xl bg-zinc-900 border border-zinc-800/80 hover:border-indigo-500/40 shadow-md hover:shadow-[0_10px_25px_rgba(99,102,241,0.12)] hover:-translate-y-1 transform group flex flex-col gap-2.5 relative overflow-hidden select-none touch-none ${task.column === lastColId ? 'bg-zinc-950/40 opacity-40' : ''}`}
    >
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[9px] text-slate-500 uppercase font-semibold font-mono tracking-wider">
          <CircleDot className="w-3 h-3 text-indigo-400" />
          <span>Pendiente</span>
        </div>
        {task.column === lastColId && (
          <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded">
            +1 XP
          </span>
        )}
      </div>

      <div>
        <h4 className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-white transition-colors leading-snug line-clamp-2">
          {task.title}
        </h4>
        {task.description && (
          <p className="text-[11px] text-slate-450 leading-relaxed mt-0.5 line-clamp-2">
            {task.description}
          </p>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end border-t border-slate-800/40 pt-2 mt-1 gap-2">
        
        {/* Edit task pencil */}
        <button
          onClick={onEdit}
          className="p-1 text-slate-500 hover:text-indigo-400 hover:bg-indigo-950/30 rounded transition-all cursor-pointer"
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
            className="p-1 text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-all flex items-center gap-0.5 cursor-pointer"
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
      '#6366f1', // Indigo
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-500 flex items-center justify-center shadow-xl shadow-emerald-500/25 animate-bounce">
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
        className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-t-xl transition-all border-t border-x cursor-pointer whitespace-nowrap ${isActive ? 'bg-[#0c0c0e] border-zinc-800 text-indigo-400 font-bold -mb-px shadow-[0_-4px_12px_rgba(0,0,0,0.3)]' : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200'}`}
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
            className="ml-1 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors shrink-0 cursor-pointer"
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
