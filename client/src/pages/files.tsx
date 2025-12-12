import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  FolderOpen,
  FileText,
  Folder,
  ChevronRight,
  ChevronDown,
  Search,
  MoreHorizontal,
  Pencil,
  Pin,
  Archive,
  File,
  FolderPlus,
  FilePlus,
  ArrowLeft,
  X,
  Save,
  BookOpen,
  FileCode,
  FileType,
  Loader2,
  Home,
  Menu,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import type { Folder as FolderType, Document, FolderWithChildren, DocumentWithFolder, DocumentType } from "@shared/schema";
import { format } from "date-fns";

const DOCUMENT_TYPES: { value: DocumentType; label: string; icon: typeof FileText }[] = [
  { value: "note", label: "Note", icon: FileText },
  { value: "document", label: "Document", icon: File },
  { value: "template", label: "Template", icon: FileCode },
  { value: "reference", label: "Reference", icon: BookOpen },
];

const FOLDER_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#6b7280", "#78716c"
];

const folderFormSchema = z.object({
  name: z.string().min(1, "Folder name is required"),
  color: z.string().optional().nullable(),
});

const documentFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["note", "document", "template", "reference"]).default("note"),
  folderId: z.string().nullable().optional(),
});

type FolderFormValues = z.infer<typeof folderFormSchema>;
type DocumentFormValues = z.infer<typeof documentFormSchema>;

function getDocumentIcon(type: DocumentType) {
  const config = DOCUMENT_TYPES.find(t => t.value === type);
  const Icon = config?.icon || FileText;
  return <Icon className="h-4 w-4" />;
}

function FolderTreeItem({
  folder,
  level = 0,
  selectedFolderId,
  onSelectFolder,
  onEditFolder,
  onDeleteFolder,
}: {
  folder: FolderWithChildren;
  level?: number;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onEditFolder: (folder: FolderType) => void;
  onDeleteFolder: (folder: FolderType) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(folder.isExpanded ?? true);
  const hasChildren = folder.children.length > 0;
  const isSelected = selectedFolderId === folder.id;
  const documentCount = folder.documents?.length || 0;

  return (
    <div data-testid={`folder-tree-item-${folder.id}`}>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer group transition-colors ${
          isSelected ? "bg-accent" : "hover-elevate"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelectFolder(folder.id)}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          data-testid={`button-expand-folder-${folder.id}`}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <div className="w-3" />
          )}
        </Button>
        <div 
          className="p-1 rounded"
          style={{ color: folder.color || "#6b7280" }}
        >
          {isExpanded ? (
            <FolderOpen className="h-4 w-4" />
          ) : (
            <Folder className="h-4 w-4" />
          )}
        </div>
        <span className="flex-1 truncate text-sm">{folder.name}</span>
        {documentCount > 0 && (
          <Badge variant="secondary" className="text-[10px] opacity-60">
            {documentCount}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              data-testid={`button-folder-menu-${folder.id}`}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditFolder(folder)}>
              <Pencil className="h-3 w-3 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive"
              onClick={() => onDeleteFolder(folder)}
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onEditFolder={onEditFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  document,
  onSelect,
  onPin,
  onArchive,
  onDelete,
}: {
  document: Document;
  onSelect: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg cursor-pointer group hover-elevate border transition-all"
      onClick={onSelect}
      data-testid={`document-row-${document.id}`}
    >
      <div className="p-2 rounded-lg bg-muted">
        {getDocumentIcon(document.type as DocumentType)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{document.title}</p>
          {document.isPinned && (
            <Pin className="h-3 w-3 text-primary shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            {DOCUMENT_TYPES.find(t => t.value === document.type)?.label || document.type}
          </Badge>
          <span>{document.wordCount || 0} words</span>
          <span>Updated {format(new Date(document.updatedAt), "MMM d, yyyy")}</span>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100"
            data-testid={`button-document-menu-${document.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin(); }}>
            <Pin className="h-3 w-3 mr-2" />
            {document.isPinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(); }}>
            <Archive className="h-3 w-3 mr-2" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            className="text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3 w-3 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DocumentEditor({
  document,
  onClose,
  onSave,
}: {
  document: DocumentWithFolder;
  onClose: () => void;
  onSave: (id: string, data: { title: string; content: string }) => void;
}) {
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setTitle(document.title);
    setContent(document.content);
    setHasChanges(false);
  }, [document.id]);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(document.id, { title, content });
    setIsSaving(false);
    setHasChanges(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b">
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-editor">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          {document.folder && (
            <>
              <Badge variant="outline" className="text-xs">
                <Folder className="h-3 w-3 mr-1" />
                {document.folder.name}
              </Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </>
          )}
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setHasChanges(true);
            }}
            className="font-semibold border-0 text-lg focus-visible:ring-0 px-0 h-auto"
            placeholder="Untitled document"
            data-testid="input-document-title"
          />
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          data-testid="button-save-document"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4 mr-1" />
              Save
            </>
          )}
        </Button>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setHasChanges(true);
          }}
          className="min-h-[calc(100vh-200px)] resize-none border-0 focus-visible:ring-0 text-base leading-relaxed"
          placeholder="Start writing..."
          data-testid="textarea-document-content"
        />
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
        <span>{content.split(/\s+/).filter(w => w.length > 0).length} words</span>
        <span>Last updated {format(new Date(document.updatedAt), "MMM d, yyyy h:mm a")}</span>
      </div>
    </div>
  );
}

export default function FilesPage() {
  const { toast } = useToast();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithFolder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [isNewDocumentOpen, setIsNewDocumentOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderType | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<Document | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { data: folderTree, isLoading: foldersLoading } = useQuery<FolderWithChildren[]>({
    queryKey: ["/api/folders/tree"],
  });

  const { data: documents, isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents", selectedFolderId, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.set("search", searchQuery);
      } else if (selectedFolderId !== null) {
        params.set("folderId", selectedFolderId);
      } else {
        params.set("folderId", "null");
      }
      const res = await fetch(`/api/documents?${params}`);
      return res.json();
    },
  });

  const folderForm = useForm<FolderFormValues>({
    resolver: zodResolver(folderFormSchema),
    defaultValues: { name: "", color: "#3b82f6" },
  });

  const documentForm = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: { title: "", type: "note", folderId: null },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: FolderFormValues) => {
      const response = await apiRequest("POST", "/api/folders", { ...data, parentId: selectedFolderId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders/tree"] });
      setIsNewFolderOpen(false);
      folderForm.reset();
      toast({ title: "Folder created" });
    },
    onError: () => {
      toast({ title: "Failed to create folder", variant: "destructive" });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FolderFormValues> }) => {
      const response = await apiRequest("PATCH", `/api/folders/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders/tree"] });
      setEditingFolder(null);
      toast({ title: "Folder updated" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders/tree"] });
      if (selectedFolderId === deletingFolder?.id) {
        setSelectedFolderId(null);
      }
      setDeletingFolder(null);
      toast({ title: "Folder deleted" });
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: DocumentFormValues) => {
      const response = await apiRequest("POST", "/api/documents", { ...data, folderId: selectedFolderId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders/tree"] });
      setIsNewDocumentOpen(false);
      documentForm.reset();
      toast({ title: "Document created" });
    },
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Document> }) => {
      const response = await apiRequest("PATCH", `/api/documents/${id}`, data);
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders/tree"] });
      if (selectedDocument?.id === variables.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", variables.id] });
      }
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders/tree"] });
      setDeletingDocument(null);
      if (selectedDocument?.id === deletingDocument?.id) {
        setSelectedDocument(null);
      }
      toast({ title: "Document deleted" });
    },
  });

  const handleSelectDocument = async (doc: Document) => {
    const res = await fetch(`/api/documents/${doc.id}`);
    const fullDoc = await res.json();
    setSelectedDocument(fullDoc);
  };

  const handleSaveDocument = async (id: string, data: { title: string; content: string }) => {
    await updateDocumentMutation.mutateAsync({ id, data });
    const res = await fetch(`/api/documents/${id}`);
    const updatedDoc = await res.json();
    setSelectedDocument(updatedDoc);
    toast({ title: "Document saved" });
  };

  if (selectedDocument) {
    return (
      <div className="h-full">
        <DocumentEditor
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          onSave={handleSaveDocument}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex relative">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}
      
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 border-r flex flex-col bg-sidebar transform transition-transform duration-200 ease-in-out
        md:relative md:transform-none md:z-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Files</h2>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 md:hidden" 
                onClick={() => setIsSidebarOpen(false)}
                data-testid="button-close-sidebar"
                aria-label="Close folders sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
              <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-new-folder">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Folder</DialogTitle>
                  </DialogHeader>
                  <Form {...folderForm}>
                    <form onSubmit={folderForm.handleSubmit((data) => createFolderMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={folderForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Folder name" data-testid="input-folder-name" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={folderForm.control}
                        name="color"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Color</FormLabel>
                            <FormControl>
                              <div className="flex gap-2 flex-wrap">
                                {FOLDER_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    className={`h-6 w-6 rounded-full border-2 ${field.value === color ? "border-foreground" : "border-transparent"}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => field.onChange(color)}
                                  />
                                ))}
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={createFolderMutation.isPending}>
                        {createFolderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Folder"}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              <Dialog open={isNewDocumentOpen} onOpenChange={setIsNewDocumentOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-new-document">
                    <FilePlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Document</DialogTitle>
                  </DialogHeader>
                  <Form {...documentForm}>
                    <form onSubmit={documentForm.handleSubmit((data) => createDocumentMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={documentForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Document title" data-testid="input-document-title-form" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={documentForm.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {DOCUMENT_TYPES.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>
                                    <div className="flex items-center gap-2">
                                      <type.icon className="h-4 w-4" />
                                      {type.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={createDocumentMutation.isPending}>
                        {createDocumentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Document"}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-search-files"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div
              className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer mb-1 ${
                selectedFolderId === null && !searchQuery ? "bg-accent" : "hover-elevate"
              }`}
              onClick={() => {
                setSelectedFolderId(null);
                setSearchQuery("");
                setIsSidebarOpen(false);
              }}
              data-testid="folder-root"
            >
              <Home className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">All Files</span>
            </div>
            {foldersLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              folderTree?.map((folder) => (
                <FolderTreeItem
                  key={folder.id}
                  folder={folder}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={(id) => {
                    setSelectedFolderId(id);
                    setSearchQuery("");
                    setIsSidebarOpen(false);
                  }}
                  onEditFolder={setEditingFolder}
                  onDeleteFolder={setDeletingFolder}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 md:p-4 border-b">
          <div className="flex items-center gap-2 md:gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="md:hidden shrink-0"
              onClick={() => setIsSidebarOpen(true)}
              data-testid="button-open-sidebar"
              aria-label="Open folders sidebar"
              aria-expanded={isSidebarOpen}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-xl font-semibold truncate">
                {searchQuery ? `Search: "${searchQuery}"` : selectedFolderId ? folderTree?.find(f => f.id === selectedFolderId)?.name || "Folder" : "All Files"}
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {documents?.length || 0} document{documents?.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Button onClick={() => setIsNewDocumentOpen(true)} data-testid="button-create-document" className="shrink-0">
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">New Document</span>
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 md:p-4 space-y-2">
            {documentsLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : documents?.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground text-center">
                    {searchQuery ? "No documents found" : "No documents yet"}
                  </p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setIsNewDocumentOpen(true)}
                    data-testid="button-create-first-document"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first document
                  </Button>
                </CardContent>
              </Card>
            ) : (
              documents?.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onSelect={() => handleSelectDocument(doc)}
                  onPin={() => updateDocumentMutation.mutate({ id: doc.id, data: { isPinned: !doc.isPinned } })}
                  onArchive={() => updateDocumentMutation.mutate({ id: doc.id, data: { isArchived: true } })}
                  onDelete={() => setDeletingDocument(doc)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={!!editingFolder} onOpenChange={() => setEditingFolder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              updateFolderMutation.mutate({
                id: editingFolder!.id,
                data: { name: formData.get("name") as string },
              });
            }}
            className="space-y-4"
          >
            <Input
              name="name"
              defaultValue={editingFolder?.name}
              placeholder="Folder name"
              data-testid="input-rename-folder"
            />
            <Button type="submit" className="w-full" disabled={updateFolderMutation.isPending}>
              {updateFolderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingFolder} onOpenChange={() => setDeletingFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the folder "{deletingFolder?.name}". Documents in this folder will be moved to the root.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteFolderMutation.mutate(deletingFolder!.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingDocument} onOpenChange={() => setDeletingDocument(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingDocument?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDocumentMutation.mutate(deletingDocument!.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
