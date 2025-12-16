import { DeviceInfo } from "@/components/DeviceCard";
import { Message } from "@/components/ChatBubble";
import { Memory } from "@/lib/storage";

export const mockDevices: DeviceInfo[] = [
  {
    id: "omi-1",
    name: "My Omi",
    type: "omi",
    isConnected: true,
    batteryLevel: 78,
    lastSync: "2 min ago",
    isRecording: true,
  },
  {
    id: "limitless-1",
    name: "Limitless Pendant",
    type: "limitless",
    isConnected: true,
    batteryLevel: 45,
    lastSync: "15 min ago",
    isRecording: false,
  },
];

export const mockMemories: Memory[] = [
  {
    id: "mem-1",
    title: "Morning standup meeting",
    transcript: "We discussed the quarterly targets and sprint planning for the next two weeks. The team is focused on delivering the new dashboard features...",
    timestamp: "Today, 9:30 AM",
    deviceType: "omi",
    speakers: ["Alex", "Jordan", "Sam"],
    isStarred: true,
    duration: "23 min",
  },
  {
    id: "mem-2",
    title: "Product brainstorm session",
    transcript: "Explored new feature ideas for the mobile app. Key suggestions included improved onboarding flow and personalized recommendations...",
    timestamp: "Today, 2:15 PM",
    deviceType: "limitless",
    speakers: ["Taylor", "Morgan"],
    isStarred: false,
    duration: "45 min",
  },
  {
    id: "mem-3",
    title: "Client call - Q4 Review",
    transcript: "Reviewed client feedback on the latest release. They are happy with performance improvements but requested additional analytics...",
    timestamp: "Yesterday, 4:00 PM",
    deviceType: "omi",
    speakers: ["Client", "You"],
    isStarred: true,
    duration: "32 min",
  },
  {
    id: "mem-4",
    title: "Coffee chat with mentor",
    transcript: "Discussed career growth strategies and upcoming opportunities. Got great advice on improving technical leadership skills...",
    timestamp: "Yesterday, 11:00 AM",
    deviceType: "limitless",
    speakers: ["Mentor"],
    isStarred: false,
    duration: "18 min",
  },
  {
    id: "mem-5",
    title: "Team retrospective",
    transcript: "Reflected on the past sprint successes and areas for improvement. The team agreed to focus more on code reviews...",
    timestamp: "2 days ago",
    deviceType: "omi",
    speakers: ["Team"],
    isStarred: false,
    duration: "40 min",
  },
];

export const mockMessages: Message[] = [
  {
    id: "msg-1",
    content: "Hello! How can I help you today?",
    role: "assistant",
    timestamp: "10:00 AM",
  },
  {
    id: "msg-2",
    content: "Can you summarize my meetings from today?",
    role: "user",
    timestamp: "10:01 AM",
  },
  {
    id: "msg-3",
    content: "Based on your recordings today, you had 2 meetings:\n\n1. **Morning standup** (9:30 AM, 23 min) - Discussed quarterly targets and sprint planning.\n\n2. **Product brainstorm** (2:15 PM, 45 min) - Explored new mobile app features including improved onboarding.\n\nWould you like more details on either meeting?",
    role: "assistant",
    timestamp: "10:01 AM",
  },
];

export const recentSearches = [
  "quarterly targets",
  "product features",
  "client feedback",
  "sprint planning",
];
