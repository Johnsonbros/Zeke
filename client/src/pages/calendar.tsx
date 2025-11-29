import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  Save,
  FileText,
  Filter,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
  isToday,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CalendarInfo {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor: string;
  primary?: boolean;
  selected?: boolean;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId?: string;
  calendarName?: string;
  backgroundColor?: string;
}

interface CalendarFetchResult {
  events: CalendarEvent[];
  failedCalendars: { id: string; name: string; error: string }[];
}

type ViewType = "today" | "week" | "month";

interface EventEditDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EventEditDialog({ event, open, onOpenChange }: EventEditDialogProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    summary: "",
    description: "",
    location: "",
    startTime: "",
    endTime: "",
  });

  useEffect(() => {
    if (event) {
      const startDate = parseISO(event.start);
      const endDate = parseISO(event.end);
      setFormData({
        summary: event.summary,
        description: event.description || "",
        location: event.location || "",
        startTime: event.allDay ? "" : format(startDate, "yyyy-MM-dd'T'HH:mm"),
        endTime: event.allDay ? "" : format(endDate, "yyyy-MM-dd'T'HH:mm"),
      });
      setIsEditing(false);
    }
  }, [event]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("PUT", `/api/calendar/events/${event?.id}`, {
        summary: data.summary,
        description: data.description || undefined,
        location: data.location || undefined,
        startTime: data.startTime ? new Date(data.startTime).toISOString() : undefined,
        endTime: data.endTime ? new Date(data.endTime).toISOString() : undefined,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({
        title: "Event updated",
        description: "Changes synced to Google Calendar",
      });
      setIsEditing(false);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      let errorMessage = "Please try again later";
      try {
        const errorText = error.message;
        if (errorText.includes("Event type cannot be changed")) {
          errorMessage = "This event cannot be edited (auto-generated from email)";
        } else if (errorText.includes(":")) {
          const jsonPart = errorText.substring(errorText.indexOf(":") + 1).trim();
          const parsed = JSON.parse(jsonPart);
          errorMessage = parsed.error || errorMessage;
        }
      } catch {
        errorMessage = error.message || "Please try again later";
      }
      toast({
        title: "Failed to update event",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/calendar/events/${event?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({
        title: "Event deleted",
        description: "Removed from Google Calendar",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      let errorMessage = "Please try again later";
      try {
        const errorText = error.message;
        if (errorText.includes(":")) {
          const jsonPart = errorText.substring(errorText.indexOf(":") + 1).trim();
          const parsed = JSON.parse(jsonPart);
          errorMessage = parsed.error || errorMessage;
        }
      } catch {
        errorMessage = error.message || "Please try again later";
      }
      toast({
        title: "Failed to delete event",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!formData.summary.trim()) {
      toast({
        title: "Title required",
        description: "Please enter an event title",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(formData);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    deleteMutation.mutate();
  };

  if (!event) return null;

  const startDate = parseISO(event.start);
  const endDate = parseISO(event.end);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6 gap-3 sm:gap-4">
          <DialogHeader className="space-y-1.5 sm:space-y-2">
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-base sm:text-lg pr-8">
                {isEditing ? "Edit Event" : event.summary}
              </DialogTitle>
            </div>
            {!isEditing && (
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {event.allDay ? (
                  <Badge variant="secondary" className="text-[10px] sm:text-xs">
                    All day
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] sm:text-xs">
                    <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                    {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] sm:text-xs">
                  <CalendarIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                  {format(startDate, "MMM d, yyyy")}
                </Badge>
              </div>
            )}
          </DialogHeader>

          {isEditing ? (
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="summary" className="text-xs sm:text-sm">
                  Title
                </Label>
                <Input
                  id="summary"
                  value={formData.summary}
                  onChange={(e) =>
                    setFormData({ ...formData, summary: e.target.value })
                  }
                  placeholder="Event title"
                  className="h-9 sm:h-10 text-sm"
                  data-testid="input-event-title"
                />
              </div>

              {!event.allDay && (
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="startTime" className="text-xs sm:text-sm">
                      Start
                    </Label>
                    <Input
                      id="startTime"
                      type="datetime-local"
                      value={formData.startTime}
                      onChange={(e) =>
                        setFormData({ ...formData, startTime: e.target.value })
                      }
                      className="h-9 sm:h-10 text-sm"
                      data-testid="input-event-start"
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="endTime" className="text-xs sm:text-sm">
                      End
                    </Label>
                    <Input
                      id="endTime"
                      type="datetime-local"
                      value={formData.endTime}
                      onChange={(e) =>
                        setFormData({ ...formData, endTime: e.target.value })
                      }
                      className="h-9 sm:h-10 text-sm"
                      data-testid="input-event-end"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="location" className="text-xs sm:text-sm">
                  Location
                </Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  placeholder="Add location"
                  className="h-9 sm:h-10 text-sm"
                  data-testid="input-event-location"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="description" className="text-xs sm:text-sm">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Add description"
                  className="min-h-[80px] sm:min-h-[100px] text-sm resize-none"
                  data-testid="input-event-description"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {event.location && (
                <div className="flex items-start gap-2 text-xs sm:text-sm">
                  <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.description && (
                <div className="flex items-start gap-2 text-xs sm:text-sm">
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{event.description}</span>
                </div>
              )}
              {!event.location && !event.description && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  No additional details
                </p>
              )}
            </div>
          )}

          <DialogFooter className="flex-row gap-2 sm:gap-3 pt-2">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 sm:flex-none"
                  data-testid="button-cancel-edit"
                >
                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex-1 sm:flex-none"
                  data-testid="button-save-event"
                >
                  <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive hover:text-destructive"
                  data-testid="button-delete-event"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="flex-1 sm:flex-none"
                  data-testid="button-edit-event"
                >
                  <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                  Edit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">Delete Event?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              This will permanently delete "{event.summary}" from your Google
              Calendar. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:gap-3">
            <AlertDialogCancel className="flex-1 sm:flex-none" data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="flex-1 sm:flex-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EventCard({ event, onClick }: { event: CalendarEvent; onClick?: () => void }) {
  const startDate = parseISO(event.start);
  const endDate = parseISO(event.end);
  const borderColor = event.backgroundColor || undefined;

  return (
    <Card
      className="p-2 sm:p-3 hover-elevate cursor-pointer border-l-4"
      style={{ borderLeftColor: borderColor }}
      data-testid={`event-card-${event.id}`}
      onClick={onClick}
    >
      <div className="flex flex-col gap-0.5 sm:gap-1">
        <div className="flex items-start justify-between gap-1">
          <span className="text-xs sm:text-sm font-medium line-clamp-2">{event.summary}</span>
        </div>
        {event.calendarName && event.calendarName !== 'primary' && (
          <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
            {event.calendarName}
          </span>
        )}
        {!event.allDay && (
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span className="truncate">
              {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
            </span>
          </div>
        )}
        {event.allDay && (
          <Badge variant="secondary" className="w-fit text-[10px] sm:text-xs">
            All day
          </Badge>
        )}
        {event.location && (
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function DayColumn({
  date,
  events,
  isCurrentDay,
  onEventClick,
}: {
  date: Date;
  events: CalendarEvent[];
  isCurrentDay: boolean;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const dayEvents = events.filter((event) => {
    const eventStart = parseISO(event.start);
    return isSameDay(eventStart, date);
  });

  return (
    <div className="flex-1 min-w-[100px] sm:min-w-[120px] md:min-w-[140px] flex flex-col border-r last:border-r-0">
      <div
        className={`text-center py-2 sm:py-3 border-b ${
          isCurrentDay ? "bg-primary/10" : ""
        }`}
      >
        <div className="text-[10px] sm:text-xs text-muted-foreground uppercase">
          {format(date, "EEE")}
        </div>
        <div
          className={`text-base sm:text-lg font-semibold ${
            isCurrentDay ? "text-primary" : ""
          }`}
        >
          {format(date, "d")}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1.5 sm:p-2 space-y-1.5 sm:space-y-2">
          {dayEvents.length === 0 ? (
            <div className="text-[10px] sm:text-xs text-muted-foreground text-center py-3 sm:py-4">
              No events
            </div>
          ) : (
            dayEvents.map((event) => (
              <EventCard 
                key={event.id} 
                event={event} 
                onClick={() => onEventClick(event)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="flex gap-2 h-full">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="flex-1 min-w-[140px] flex flex-col">
          <div className="text-center py-3 border-b">
            <Skeleton className="h-3 w-10 mx-auto mb-1" />
            <Skeleton className="h-6 w-6 mx-auto" />
          </div>
          <div className="p-2 space-y-2">
            {[1, 2].map((j) => (
              <Skeleton key={j} className="h-20 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewType>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('zeke-selected-calendars');
    return saved ? new Set(JSON.parse(saved)) : new Set<string>();
  });

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventDialogOpen(true);
  };

  const { data: calendars } = useQuery<CalendarInfo[]>({
    queryKey: ["/api/calendar/list"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (calendars && selectedCalendars.size === 0) {
      const allIds = new Set(calendars.map(c => c.id));
      setSelectedCalendars(allIds);
      localStorage.setItem('zeke-selected-calendars', JSON.stringify([...allIds]));
    }
  }, [calendars]);

  const toggleCalendar = (calendarId: string) => {
    setSelectedCalendars(prev => {
      const next = new Set(prev);
      if (next.has(calendarId)) {
        next.delete(calendarId);
      } else {
        next.add(calendarId);
      }
      localStorage.setItem('zeke-selected-calendars', JSON.stringify([...next]));
      return next;
    });
  };

  const getDateRange = () => {
    if (view === "today") {
      return {
        start: startOfDay(currentDate),
        end: endOfDay(currentDate),
      };
    } else if (view === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      };
    } else {
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      };
    }
  };

  const dateRange = getDateRange();
  const calendarIdsParam = selectedCalendars.size > 0 ? [...selectedCalendars].join(',') : '';
  const { toast } = useToast();

  const { data: eventsData, isLoading, error } = useQuery<CalendarFetchResult>({
    queryKey: [
      "/api/calendar/events",
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
      calendarIdsParam,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      });
      if (calendarIdsParam) {
        params.set('calendars', calendarIdsParam);
      }
      const res = await fetch(`/api/calendar/events?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch events");
      }
      return res.json();
    },
    enabled: selectedCalendars.size > 0,
  });

  const events = eventsData?.events;
  const failedCalendars = eventsData?.failedCalendars;

  useEffect(() => {
    if (failedCalendars && failedCalendars.length > 0) {
      const calendarNames = failedCalendars.map(c => c.name).join(', ');
      toast({
        title: "Some calendars couldn't be loaded",
        description: `Events from ${calendarNames} may be missing.`,
        variant: "destructive",
      });
    }
  }, [failedCalendars, toast]);

  const navigatePrev = () => {
    if (view === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else if (view === "month") {
      setCurrentDate(subWeeks(currentDate, 4));
    }
  };

  const navigateNext = () => {
    if (view === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else if (view === "month") {
      setCurrentDate(addWeeks(currentDate, 4));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getWeekDays = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  const weekDays = getWeekDays();

  return (
    <div className="flex flex-col h-full" data-testid="calendar-page">
      <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 md:p-6 border-b">
        <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold">Calendar</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {format(dateRange.start, "MMM d")} -{" "}
                {format(dateRange.end, "MMM d, yyyy")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm gap-1.5"
                  data-testid="button-calendar-filter"
                >
                  <Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Calendars</span>
                  {calendars && selectedCalendars.size < calendars.length && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {selectedCalendars.size}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Calendars</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        if (calendars) {
                          const allIds = new Set(calendars.map(c => c.id));
                          setSelectedCalendars(allIds);
                          localStorage.setItem('zeke-selected-calendars', JSON.stringify([...allIds]));
                        }
                      }}
                    >
                      Select All
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {calendars?.map(calendar => (
                      <label
                        key={calendar.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded-md"
                        data-testid={`calendar-toggle-${calendar.id}`}
                      >
                        <Checkbox
                          checked={selectedCalendars.has(calendar.id)}
                          onCheckedChange={() => toggleCalendar(calendar.id)}
                        />
                        <div
                          className="h-3 w-3 rounded-sm shrink-0"
                          style={{ backgroundColor: calendar.backgroundColor }}
                        />
                        <span className="text-sm truncate flex-1">
                          {calendar.primary ? 'My Calendar' : calendar.summary}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center rounded-lg border p-0.5 sm:p-1">
              <Button
                variant={view === "today" ? "default" : "ghost"}
                size="sm"
                className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm"
                onClick={() => {
                  setView("today");
                  goToToday();
                }}
                data-testid="view-toggle-today"
              >
                Today
              </Button>
              <Button
                variant={view === "week" ? "default" : "ghost"}
                size="sm"
                className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm"
                onClick={() => setView("week")}
                data-testid="view-toggle-week"
              >
                Week
              </Button>
              <Button
                variant={view === "month" ? "default" : "ghost"}
                size="sm"
                className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm hidden sm:inline-flex"
                onClick={() => setView("month")}
                data-testid="view-toggle-month"
              >
                Month
              </Button>
            </div>
          </div>
        </div>

        {view !== "today" && (
          <div className="flex items-center justify-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={navigatePrev}
              data-testid="nav-prev-week"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={navigateNext}
              data-testid="nav-next-week"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <CalendarSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 sm:gap-4 p-4 sm:p-6 md:p-8">
            <CalendarIcon className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="text-base sm:text-lg font-medium">Unable to load calendar</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {error instanceof Error
                  ? error.message
                  : "Please try again later"}
              </p>
            </div>
          </div>
        ) : view === "today" ? (
          <ScrollArea className="h-full">
            <div className="p-3 sm:p-4 md:p-6 space-y-2 sm:space-y-3 max-w-2xl mx-auto">
              <div className="text-center mb-4 sm:mb-6">
                <div className="text-xl sm:text-2xl font-semibold">
                  {format(currentDate, "EEEE")}
                </div>
                <div className="text-sm sm:text-base text-muted-foreground">
                  {format(currentDate, "MMMM d, yyyy")}
                </div>
              </div>
              {events && events.length > 0 ? (
                events.map((event) => (
                  <EventCard 
                    key={event.id} 
                    event={event} 
                    onClick={() => handleEventClick(event)}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 gap-2 sm:gap-3">
                  <CalendarIcon className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                  <p className="text-sm sm:text-base text-muted-foreground">No events today</p>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex h-full overflow-x-auto">
            {weekDays.map((date) => (
              <DayColumn
                key={date.toISOString()}
                date={date}
                events={events || []}
                isCurrentDay={isToday(date)}
                onEventClick={handleEventClick}
              />
            ))}
          </div>
        )}
      </div>

      <EventEditDialog
        event={selectedEvent}
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
      />
    </div>
  );
}
