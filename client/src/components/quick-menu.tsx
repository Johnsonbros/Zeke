import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, PanInfo, useDragControls } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  GripVertical, 
  X, 
  Plus, 
  Check,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  ShoppingCart,
  ListTodo,
  Calendar,
  Brain,
  Users,
  Zap,
  Phone,
  MapPin,
  Bot,
  List,
  Utensils,
  Mic,
  Network,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "zeke-quick-menu-shortcuts";
const MAX_SHORTCUTS = 5;

export interface QuickMenuShortcut {
  id: string;
  title: string;
  href: string;
  icon: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  ShoppingCart,
  ListTodo,
  Calendar,
  Brain,
  Users,
  Zap,
  Phone,
  MapPin,
  Bot,
  List,
  Utensils,
  Mic,
  Network,
  Settings,
};

const availableShortcuts: QuickMenuShortcut[] = [
  { id: "dashboard", title: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { id: "chat", title: "Chat", href: "/chat", icon: "MessageSquare" },
  { id: "profile", title: "Profile", href: "/profile", icon: "Sparkles" },
  { id: "grocery", title: "Grocery", href: "/grocery", icon: "ShoppingCart" },
  { id: "lists", title: "Lists", href: "/lists", icon: "List" },
  { id: "meals", title: "Meals", href: "/meals", icon: "Utensils" },
  { id: "tasks", title: "Tasks", href: "/tasks", icon: "ListTodo" },
  { id: "calendar", title: "Calendar", href: "/calendar", icon: "Calendar" },
  { id: "memory", title: "Memory", href: "/memory", icon: "Brain" },
  { id: "contacts", title: "Contacts", href: "/contacts", icon: "Users" },
  { id: "automations", title: "Automations", href: "/automations", icon: "Zap" },
  { id: "location", title: "Locations", href: "/location", icon: "MapPin" },
  { id: "sms-log", title: "SMS Log", href: "/sms-log", icon: "Phone" },
  { id: "context-agent", title: "Context", href: "/context-agent", icon: "Bot" },
  { id: "omi", title: "Omi", href: "/omi", icon: "Mic" },
  { id: "knowledge-graph", title: "Graph", href: "/knowledge-graph", icon: "Network" },
  { id: "integrations", title: "Settings", href: "/integrations", icon: "Settings" },
];

const defaultShortcuts: QuickMenuShortcut[] = [
  availableShortcuts[1], // Chat
  availableShortcuts[6], // Tasks
  availableShortcuts[7], // Calendar
  availableShortcuts[8], // Memory
];

function getStoredShortcuts(): QuickMenuShortcut[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((s: { id: string }) => 
          availableShortcuts.find(a => a.id === s.id) || s
        ).filter(Boolean) as QuickMenuShortcut[];
      }
    }
  } catch {
  }
  return defaultShortcuts;
}

function saveShortcuts(shortcuts: QuickMenuShortcut[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts.map(s => ({ id: s.id }))));
}

interface DraggableItemProps {
  shortcut: QuickMenuShortcut;
  index: number;
  isEditing: boolean;
  isWiggling: boolean;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onStartEditing: () => void;
  totalItems: number;
}

function DraggableShortcut({ 
  shortcut, 
  index, 
  isEditing, 
  isWiggling,
  onRemove, 
  onReorder,
  onStartEditing,
  totalItems,
}: DraggableItemProps) {
  const Icon = iconMap[shortcut.icon] || LayoutDashboard;
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handleDragEnd = (_: never, info: PanInfo) => {
    setIsDragging(false);
    const itemWidth = 72;
    const moveDistance = info.offset.x;
    const indexChange = Math.round(moveDistance / itemWidth);
    
    if (indexChange !== 0) {
      const newIndex = Math.max(0, Math.min(totalItems - 1, index + indexChange));
      if (newIndex !== index) {
        onReorder(index, newIndex);
      }
    }
  };

  const handleTouchStart = useCallback(() => {
    if (isEditing) return;
    didLongPress.current = false;
    longPressRef.current = setTimeout(() => {
      didLongPress.current = true;
      onStartEditing();
    }, 500);
  }, [isEditing, onStartEditing]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    if (didLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const wiggleAnimation = isWiggling && isEditing ? {
    rotate: [0, -2, 2, -2, 0],
    transition: {
      duration: 0.3,
      repeat: Infinity,
      ease: "easeInOut",
    }
  } : {};

  if (isEditing) {
    return (
      <motion.div
        ref={itemRef}
        layout
        drag="x"
        dragControls={dragControls}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        animate={wiggleAnimation}
        className={cn(
          "relative flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing touch-none select-none",
          isDragging && "z-50"
        )}
        whileDrag={{ scale: 1.1, zIndex: 50 }}
        data-testid={`quick-menu-item-${shortcut.id}`}
      >
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-accent/80 flex items-center justify-center border border-border/50">
            <Icon className="h-6 w-6 text-foreground" />
          </div>
          <Button
            size="icon"
            variant="destructive"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(shortcut.id);
            }}
            data-testid={`button-remove-shortcut-${shortcut.id}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">
          {shortcut.title}
        </span>
      </motion.div>
    );
  }

  return (
    <Link href={shortcut.href}>
      <motion.div
        layout
        className="flex flex-col items-center gap-1"
        whileTap={{ scale: 0.95 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        data-testid={`quick-menu-link-${shortcut.id}`}
      >
        <div className="w-14 h-14 rounded-2xl bg-accent/50 flex items-center justify-center hover-elevate active-elevate-2 transition-all">
          <Icon className="h-6 w-6 text-foreground" />
        </div>
        <span className="text-[10px] text-muted-foreground truncate max-w-[56px]">
          {shortcut.title}
        </span>
      </motion.div>
    </Link>
  );
}

interface QuickMenuProps {
  className?: string;
}

export function QuickMenu({ className }: QuickMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isWiggling, setIsWiggling] = useState(false);
  const [shortcuts, setShortcuts] = useState<QuickMenuShortcut[]>(getStoredShortcuts);
  const [showAddMenu, setShowAddMenu] = useState(false);
  
  const touchStart = useRef<{ y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    saveShortcuts(shortcuts);
  }, [shortcuts]);

  useEffect(() => {
    if (isEditing) {
      const timer = setTimeout(() => setIsWiggling(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsWiggling(false);
    }
  }, [isEditing]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { y: touch.clientY, time: Date.now() };
    
    longPressTimer.current = setTimeout(() => {
      setIsEditing(true);
      setIsOpen(true);
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    
    if (longPressTimer.current) {
      const touch = e.touches[0];
      const deltaY = Math.abs(touch.clientY - touchStart.current.y);
      if (deltaY > 10) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!touchStart.current) return;

    const touch = e.changedTouches[0];
    const deltaY = touchStart.current.y - touch.clientY;
    const elapsed = Date.now() - touchStart.current.time;

    if (elapsed < 300 && Math.abs(deltaY) > 30) {
      if (deltaY > 0) {
        setIsOpen(true);
      } else {
        if (!isEditing) {
          setIsOpen(false);
        }
      }
    }

    touchStart.current = null;
  }, [isEditing]);

  const handleRemoveShortcut = useCallback((id: string) => {
    setShortcuts(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleAddShortcut = useCallback((shortcut: QuickMenuShortcut) => {
    if (shortcuts.length >= MAX_SHORTCUTS) return;
    if (shortcuts.some(s => s.id === shortcut.id)) return;
    setShortcuts(prev => [...prev, shortcut]);
    setShowAddMenu(false);
  }, [shortcuts]);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setShortcuts(prev => {
      const newShortcuts = [...prev];
      const [removed] = newShortcuts.splice(fromIndex, 1);
      newShortcuts.splice(toIndex, 0, removed);
      return newShortcuts;
    });
  }, []);

  const handleDoneEditing = useCallback(() => {
    setIsEditing(false);
    setShowAddMenu(false);
  }, []);

  const availableToAdd = availableShortcuts.filter(
    a => !shortcuts.some(s => s.id === a.id)
  );

  return (
    <div 
      ref={containerRef}
      className={cn("fixed bottom-0 left-0 right-0 z-50 md:hidden", className)}
      data-testid="quick-menu-container"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-background/95 backdrop-blur-lg border-t border-border overflow-hidden"
            data-testid="quick-menu-panel"
          >
            <div
              className="flex justify-center py-2 cursor-pointer"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={() => !isEditing && setIsOpen(false)}
              data-testid="quick-menu-handle-open"
            >
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>
            <div className="p-4 pb-6 safe-area-inset-bottom">
              {isEditing && (
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-foreground">Edit Shortcuts</span>
                  <Button 
                    size="sm" 
                    onClick={handleDoneEditing}
                    data-testid="button-done-editing"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Done
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 min-h-[80px]">
                <AnimatePresence mode="popLayout">
                  {shortcuts.map((shortcut, index) => (
                    <DraggableShortcut
                      key={shortcut.id}
                      shortcut={shortcut}
                      index={index}
                      isEditing={isEditing}
                      isWiggling={isWiggling}
                      onRemove={handleRemoveShortcut}
                      onReorder={handleReorder}
                      onStartEditing={() => setIsEditing(true)}
                      totalItems={shortcuts.length}
                    />
                  ))}
                </AnimatePresence>

                {isEditing && shortcuts.length < MAX_SHORTCUTS && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="flex flex-col items-center gap-1"
                  >
                    <Button
                      size="icon"
                      variant="outline"
                      className="w-14 h-14 rounded-2xl border-dashed"
                      onClick={() => setShowAddMenu(true)}
                      data-testid="button-add-shortcut"
                    >
                      <Plus className="h-6 w-6" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground">Add</span>
                  </motion.div>
                )}
              </div>

              {!isEditing && (
                <p className="text-center text-[10px] text-muted-foreground mt-3">
                  Long press to edit
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <div
          className="flex justify-center pb-1 cursor-pointer"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => setIsOpen(true)}
          data-testid="quick-menu-handle-closed"
        >
          <div className="w-12 h-[3px] bg-muted-foreground/50 rounded-full" />
        </div>
      )}

      <AnimatePresence>
        {showAddMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setShowAddMenu(false)}
            data-testid="add-shortcut-overlay"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background border-t border-border rounded-t-2xl w-full max-h-[60vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
              data-testid="add-shortcut-panel"
            >
              <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background">
                <span className="font-medium">Add Shortcut</span>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => setShowAddMenu(false)}
                  data-testid="button-close-add-menu"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-4 grid grid-cols-4 gap-4 overflow-y-auto max-h-[calc(60vh-60px)]">
                {availableToAdd.map((shortcut) => {
                  const Icon = iconMap[shortcut.icon] || LayoutDashboard;
                  return (
                    <button
                      key={shortcut.id}
                      className="flex flex-col items-center gap-2 p-2 rounded-xl hover-elevate active-elevate-2"
                      onClick={() => handleAddShortcut(shortcut)}
                      data-testid={`button-add-${shortcut.id}`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-accent/50 flex items-center justify-center">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs text-muted-foreground truncate max-w-full">
                        {shortcut.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
