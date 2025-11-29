import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
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

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
}

type ViewType = "today" | "week" | "month";

function EventCard({ event }: { event: CalendarEvent }) {
  const startDate = parseISO(event.start);
  const endDate = parseISO(event.end);

  return (
    <Card
      className="p-2 sm:p-3 hover-elevate cursor-pointer border-l-2 border-l-primary"
      data-testid={`event-card-${event.id}`}
    >
      <div className="flex flex-col gap-0.5 sm:gap-1">
        <span className="text-xs sm:text-sm font-medium line-clamp-2">{event.summary}</span>
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
}: {
  date: Date;
  events: CalendarEvent[];
  isCurrentDay: boolean;
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
            dayEvents.map((event) => <EventCard key={event.id} event={event} />)
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

  const { data: events, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: [
      "/api/calendar/events",
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      });
      const res = await fetch(`/api/calendar/events?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch events");
      }
      return res.json();
    },
  });

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
                  <EventCard key={event.id} event={event} />
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
