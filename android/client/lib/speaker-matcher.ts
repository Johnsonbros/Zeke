import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SpeakerSegment } from "./deepgram";

const SPEAKER_MAPPINGS_KEY = "@zeke/speaker_mappings";

export interface SpeakerProfile {
  id: string;
  deviceId: string;
  name: string;
  voiceCharacteristics?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface SpeakerMapping {
  speakerNumber: number;
  profileId?: string;
  profileName?: string;
  isUnknown: boolean;
}

export interface LabeledSpeakerSegment extends SpeakerSegment {
  label: string;
  profileId?: string;
  color: string;
}

const SPEAKER_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#10B981",
  "#F59E0B",
  "#3B82F6",
  "#EF4444",
  "#14B8A6",
];

export function getSpeakerColor(speakerNumber: number): string {
  return SPEAKER_COLORS[speakerNumber % SPEAKER_COLORS.length];
}

export function getSpeakerLabel(
  speakerNumber: number,
  mappings: SpeakerMapping[]
): string {
  const mapping = mappings.find((m) => m.speakerNumber === speakerNumber);
  if (mapping?.profileName) {
    return mapping.profileName;
  }
  return `Speaker ${speakerNumber + 1}`;
}

export function labelSpeakerSegments(
  segments: SpeakerSegment[],
  mappings: SpeakerMapping[]
): LabeledSpeakerSegment[] {
  return segments.map((segment) => ({
    ...segment,
    label: getSpeakerLabel(segment.speaker, mappings),
    profileId: mappings.find((m) => m.speakerNumber === segment.speaker)?.profileId,
    color: getSpeakerColor(segment.speaker),
  }));
}

export async function saveSpeakerMappings(
  sessionId: string,
  mappings: SpeakerMapping[]
): Promise<void> {
  try {
    const existing = await loadAllMappings();
    existing[sessionId] = mappings;
    await AsyncStorage.setItem(SPEAKER_MAPPINGS_KEY, JSON.stringify(existing));
  } catch (error) {
    console.error("[SpeakerMatcher] Failed to save mappings:", error);
  }
}

export async function loadSpeakerMappings(
  sessionId: string
): Promise<SpeakerMapping[]> {
  try {
    const existing = await loadAllMappings();
    return existing[sessionId] || [];
  } catch (error) {
    console.error("[SpeakerMatcher] Failed to load mappings:", error);
    return [];
  }
}

async function loadAllMappings(): Promise<Record<string, SpeakerMapping[]>> {
  try {
    const data = await AsyncStorage.getItem(SPEAKER_MAPPINGS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function createDefaultMappings(speakerCount: number): SpeakerMapping[] {
  const mappings: SpeakerMapping[] = [];
  for (let i = 0; i < speakerCount; i++) {
    mappings.push({
      speakerNumber: i,
      isUnknown: true,
    });
  }
  return mappings;
}

export function getUniqueSpeakers(segments: SpeakerSegment[]): number[] {
  const speakers = new Set<number>();
  segments.forEach((s) => speakers.add(s.speaker));
  return Array.from(speakers).sort((a, b) => a - b);
}

export function assignProfileToSpeaker(
  mappings: SpeakerMapping[],
  speakerNumber: number,
  profile: SpeakerProfile
): SpeakerMapping[] {
  return mappings.map((m) =>
    m.speakerNumber === speakerNumber
      ? {
          ...m,
          profileId: profile.id,
          profileName: profile.name,
          isUnknown: false,
        }
      : m
  );
}

export function formatSpeakersForMemory(
  segments: SpeakerSegment[],
  mappings: SpeakerMapping[]
): string[] {
  const uniqueSpeakers = getUniqueSpeakers(segments);
  return uniqueSpeakers.map((s) => getSpeakerLabel(s, mappings));
}
