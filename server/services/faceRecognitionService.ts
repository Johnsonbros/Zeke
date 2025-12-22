import OpenAI from "openai";
import { 
  getAllContactFaces, 
  getContactFaces, 
  createContactFace, 
  getContact 
} from "../db";
import { ContactFace, Contact } from "@shared/schema";
import { logAiEvent } from "../aiLogger";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export interface FaceDescription {
  position: string;
  description: string;
  estimatedAge?: string;
  clothing?: string;
  distinguishingFeatures?: string[];
}

export interface FaceMatch {
  contactId: string;
  contactName: string;
  confidence: number;
  matchedFaceId: string;
  position: string;
}

const FACE_COMPARISON_PROMPT = `Compare this face description to the reference face descriptions below and determine if they match the same person.

NEW FACE:
{newFaceDescription}

REFERENCE FACES:
{referenceFaces}

For each reference face, rate the match confidence from 0.0 to 1.0:
- 0.9-1.0: Almost certainly the same person (multiple distinctive features match)
- 0.7-0.89: Very likely the same person (key features match)
- 0.5-0.69: Possibly the same person (some features match)
- 0.0-0.49: Probably not the same person

Respond in JSON:
{
  "matches": [
    {
      "referenceId": "face_id",
      "confidence": 0.85,
      "reasoning": "brief explanation"
    }
  ]
}`;

export async function matchFaceToContacts(
  faceDescription: FaceDescription
): Promise<FaceMatch[]> {
  const allFaces = getAllContactFaces();
  
  if (allFaces.length === 0) {
    return [];
  }
  
  const facesWithContacts: Array<{ face: ContactFace; contact: Contact }> = [];
  
  for (const face of allFaces) {
    const contact = getContact(face.contactId);
    if (contact) {
      facesWithContacts.push({ face, contact });
    }
  }
  
  if (facesWithContacts.length === 0) {
    return [];
  }
  
  const referenceFacesText = facesWithContacts
    .map(({ face, contact }) => {
      let features = "none noted";
      if (face.distinguishingFeatures) {
        try {
          const parsed = JSON.parse(face.distinguishingFeatures);
          features = Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
        } catch {
          features = face.distinguishingFeatures;
        }
      }
      return `ID: ${face.id}
Name: ${contact.firstName} ${contact.lastName}
Description: ${face.faceDescription}
Age: ${face.estimatedAge || "unknown"}
Distinguishing features: ${features}`;
    })
    .join("\n\n");
  
  const newFaceText = `Position: ${faceDescription.position}
Description: ${faceDescription.description}
Age: ${faceDescription.estimatedAge || "unknown"}
Clothing: ${faceDescription.clothing || "not noted"}
Distinguishing features: ${faceDescription.distinguishingFeatures?.join(", ") || "none noted"}`;

  const prompt = FACE_COMPARISON_PROMPT
    .replace("{newFaceDescription}", newFaceText)
    .replace("{referenceFaces}", referenceFacesText);
  
  const client = getOpenAIClient();
  const startTime = Date.now();
  
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    
    const content = response.choices[0]?.message?.content || "{}";
    
    logAiEvent({
      model: "gpt-4o-mini",
      endpoint: "chat.completions",
      toolName: "face_match",
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      latencyMs: Date.now() - startTime,
      status: "success",
    });
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    const matches: FaceMatch[] = [];
    
    for (const match of parsed.matches || []) {
      if (match.confidence >= 0.7) {
        const faceData = facesWithContacts.find(f => f.face.id === match.referenceId);
        if (faceData) {
          matches.push({
            contactId: faceData.contact.id,
            contactName: `${faceData.contact.firstName} ${faceData.contact.lastName}`.trim(),
            confidence: match.confidence,
            matchedFaceId: match.referenceId,
            position: faceDescription.position,
          });
        }
      }
    }
    
    return matches.sort((a, b) => b.confidence - a.confidence);
  } catch (error: any) {
    console.error("[FaceRecognition] Match failed:", error.message);
    return [];
  }
}

export async function enrollFaceFromDescription(
  contactId: string,
  faceDescription: FaceDescription,
  sourceImageId?: string,
  isPrimary = false
): Promise<ContactFace | null> {
  try {
    const existingFaces = getContactFaces(contactId);
    const shouldBePrimary = isPrimary || existingFaces.length === 0;
    
    const face = createContactFace({
      contactId,
      sourceImageId: sourceImageId || undefined,
      facePosition: faceDescription.position,
      faceDescription: faceDescription.description,
      distinguishingFeatures: faceDescription.distinguishingFeatures 
        ? JSON.stringify(faceDescription.distinguishingFeatures) 
        : undefined,
      estimatedAge: faceDescription.estimatedAge,
      isPrimary: shouldBePrimary,
      confidence: "0.9",
    });
    
    console.log(`[FaceRecognition] Enrolled face for contact ${contactId}, isPrimary: ${shouldBePrimary}`);
    
    return face;
  } catch (error: any) {
    console.error("[FaceRecognition] Enrollment failed:", error.message);
    return null;
  }
}

export function extractFaceDescriptions(personAnalysis: {
  peopleDescriptions?: Array<{
    position?: string;
    description?: string;
    estimatedAge?: string;
    clothing?: string;
    distinguishingFeatures?: string | string[];
  }>;
}): FaceDescription[] {
  if (!personAnalysis?.peopleDescriptions) {
    return [];
  }
  
  return personAnalysis.peopleDescriptions.map((person, index) => ({
    position: person.position || `person_${index + 1}`,
    description: person.description || "person",
    estimatedAge: person.estimatedAge,
    clothing: person.clothing,
    distinguishingFeatures: Array.isArray(person.distinguishingFeatures) 
      ? person.distinguishingFeatures 
      : person.distinguishingFeatures 
        ? [person.distinguishingFeatures] 
        : undefined,
  }));
}
