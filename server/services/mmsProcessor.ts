import OpenAI from "openai";
import { ImageAnalysisResult, PersonPhotoAnalysisResult, downloadMmsImage } from "./fileProcessor";
import { processAndStoreMmsImage, ImageCategory } from "./imageStorageService";
import { getContactByPhone, getContactFullName, getRecentMessages } from "../db";
import { logAiEvent } from "../aiLogger";
import { matchFaceToContacts, extractFaceDescriptions, FaceMatch } from "./faceRecognitionService";

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

interface MmsContext {
  senderPhone: string;
  senderName?: string;
  conversationId: string;
  messageText?: string;
  recentMessages?: Array<{ role: string; content: string }>;
  contactInfo?: {
    name?: string;
    tags?: string[];
    notes?: string;
  };
}

export interface MmsProcessingResult {
  analysis: ImageAnalysisResult & { personAnalysis?: PersonPhotoAnalysisResult };
  storedImageId?: string;
  storedImagePath?: string;
  category: ImageCategory;
  processingTimeMs: number;
  matchedFaces?: FaceMatch[];
}

const VALID_CATEGORIES: ImageCategory[] = [
  "selfie", "people_photo", "screenshot", "document", "receipt",
  "business_card", "location", "meme", "casual", "unknown"
];

const QUICK_CLASSIFY_PROMPT = `Classify this image into ONE category. Respond with ONLY the category name, nothing else.

Categories:
- screenshot (phone/computer screen capture)
- selfie (close-up self-portrait)
- people_photo (photo with one or more people)
- document (papers, forms, text documents)
- receipt (receipts, invoices with prices)
- business_card (contact cards)
- location (landmarks, buildings, places)
- meme (funny images, comics)
- casual (random objects, food, pets, etc.)`;

const DOCUMENT_ANALYZER_PROMPT = `Extract ALL text from this document image with 100% accuracy.

CRITICAL: Transcribe every word, number, and symbol exactly as shown.

Respond in JSON:
{
  "description": "brief document description",
  "extractedText": "complete transcription",
  "contactInfo": {
    "phoneNumbers": [],
    "emails": [],
    "addresses": [],
    "names": []
  },
  "objects": [],
  "tags": []
}`;

const RECEIPT_ANALYZER_PROMPT = `Extract all information from this receipt/invoice.

Respond in JSON:
{
  "description": "receipt from [vendor]",
  "extractedText": "full text transcription",
  "contactInfo": { "phoneNumbers": [], "emails": [], "addresses": [], "names": [] },
  "objects": ["receipt"],
  "tags": ["receipt", "purchase"]
}`;

const PEOPLE_PHOTO_PROMPT = `Analyze this photo with people. Describe each person and the scene.

Respond in JSON:
{
  "description": "scene description",
  "personAnalysis": {
    "hasPeople": true,
    "peopleCount": 1,
    "peopleDescriptions": [
      {
        "position": "center",
        "description": "physical description",
        "estimatedAge": "age range",
        "clothing": "attire",
        "distinguishingFeatures": "notable features"
      }
    ],
    "setting": "location/environment",
    "occasion": "event if apparent",
    "suggestedMemory": "memory note suggestion"
  },
  "objects": [],
  "tags": []
}`;

const CASUAL_ANALYZER_PROMPT = `Briefly describe this image.

Respond in JSON:
{
  "description": "what you see",
  "objects": ["main objects"],
  "tags": ["relevant tags"],
  "extractedText": null
}`;

const BUSINESS_CARD_PROMPT = `Extract ALL contact information from this business card with 100% accuracy.

Respond in JSON:
{
  "description": "business card for [name/company]",
  "extractedText": "full text transcription",
  "contactInfo": {
    "names": ["person and company names"],
    "phoneNumbers": ["all phone numbers exactly as shown"],
    "emails": ["all email addresses"],
    "addresses": ["full address if present"]
  },
  "objects": ["business card"],
  "tags": ["contact", "business"]
}`;

function getAnalyzerPrompt(category: ImageCategory): { prompt: string; model: string } {
  switch (category) {
    case "document":
      return { prompt: DOCUMENT_ANALYZER_PROMPT, model: "gpt-4o-mini" };
    case "receipt":
      return { prompt: RECEIPT_ANALYZER_PROMPT, model: "gpt-4o-mini" };
    case "business_card":
      return { prompt: BUSINESS_CARD_PROMPT, model: "gpt-4o" };
    case "selfie":
    case "people_photo":
      return { prompt: PEOPLE_PHOTO_PROMPT, model: "gpt-4o" };
    case "screenshot":
      return { prompt: DOCUMENT_ANALYZER_PROMPT, model: "gpt-4o-mini" };
    case "meme":
    case "casual":
    case "location":
    case "unknown":
    default:
      return { prompt: CASUAL_ANALYZER_PROMPT, model: "gpt-4o-mini" };
  }
}

async function quickClassifyImage(base64DataUrl: string, retries = 2): Promise<ImageCategory> {
  const client = getOpenAIClient();
  const startTime = Date.now();
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 20,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: QUICK_CLASSIFY_PROMPT },
              { type: "image_url", image_url: { url: base64DataUrl, detail: "low" } },
            ],
          },
        ],
      });

      const rawCategory = (response.choices[0]?.message?.content || "").toLowerCase().trim();
      
      const category = VALID_CATEGORIES.find(c => rawCategory.includes(c)) || "casual";
      
      logAiEvent({
        model: "gpt-4o-mini",
        endpoint: "chat.completions",
        toolName: "mms_quick_classify",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        latencyMs: Date.now() - startTime,
        status: "success",
      });
      
      console.log(`[MMS] Quick classify: ${category} (${Date.now() - startTime}ms, attempt ${attempt + 1})`);
      
      return category;
    } catch (error: any) {
      console.error(`[MMS] Quick classify attempt ${attempt + 1} failed:`, error.message);
      if (attempt === retries) {
        console.warn("[MMS] All classification attempts failed, defaulting to casual");
        return "casual";
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  
  return "casual";
}

function validateAndParseJson(content: string, category: ImageCategory): ImageAnalysisResult & { personAnalysis?: PersonPhotoAnalysisResult } {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`[MMS] No JSON found in response for ${category}, using raw text`);
    return {
      description: content.substring(0, 500),
      confidence: 0.5,
    };
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.description || typeof parsed.description !== "string") {
      parsed.description = `${category} image`;
    }
    
    if (parsed.contactInfo) {
      if (!Array.isArray(parsed.contactInfo.phoneNumbers)) parsed.contactInfo.phoneNumbers = [];
      if (!Array.isArray(parsed.contactInfo.emails)) parsed.contactInfo.emails = [];
      if (!Array.isArray(parsed.contactInfo.addresses)) parsed.contactInfo.addresses = [];
      if (!Array.isArray(parsed.contactInfo.names)) parsed.contactInfo.names = [];
    }
    
    if (parsed.personAnalysis) {
      if (typeof parsed.personAnalysis.hasPeople !== "boolean") {
        parsed.personAnalysis.hasPeople = true;
      }
      if (typeof parsed.personAnalysis.peopleCount !== "number") {
        parsed.personAnalysis.peopleCount = parsed.personAnalysis.peopleDescriptions?.length || 1;
      }
      if (!Array.isArray(parsed.personAnalysis.peopleDescriptions)) {
        parsed.personAnalysis.peopleDescriptions = [];
      }
    }
    
    return {
      description: parsed.description,
      extractedText: parsed.extractedText || undefined,
      contactInfo: parsed.contactInfo,
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      confidence: 0.9,
      personAnalysis: parsed.personAnalysis,
    };
  } catch (parseError: any) {
    console.warn(`[MMS] JSON parse failed for ${category}:`, parseError.message);
    return {
      description: content.substring(0, 500),
      confidence: 0.4,
    };
  }
}

async function analyzeWithOptimizedPrompt(
  base64DataUrl: string,
  category: ImageCategory,
  context?: MmsContext
): Promise<ImageAnalysisResult & { personAnalysis?: PersonPhotoAnalysisResult }> {
  const client = getOpenAIClient();
  const { prompt, model } = getAnalyzerPrompt(category);
  const startTime = Date.now();
  
  const contextNote = context?.senderName 
    ? `From ${context.senderName}${context.messageText ? `: "${context.messageText}"` : ""}\n\n`
    : "";

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: contextNote + prompt },
            { type: "image_url", image_url: { url: base64DataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    logAiEvent({
      model,
      endpoint: "chat.completions",
      toolName: `mms_analyze_${category}`,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      latencyMs: Date.now() - startTime,
      status: "success",
    });
    
    console.log(`[MMS] Analyzed ${category} with ${model} (${Date.now() - startTime}ms)`);

    return validateAndParseJson(content, category);
  } catch (error: any) {
    console.error(`[MMS] Analysis failed for ${category}:`, error.message);
    return {
      description: `${category} image (analysis failed)`,
      confidence: 0,
    };
  }
}

async function processImageWithContext(
  mediaUrl: string,
  context: MmsContext,
  cachedImageData?: { buffer: Buffer; contentType: string }
): Promise<MmsProcessingResult> {
  const startTime = Date.now();
  
  const imageData = cachedImageData || await downloadMmsImage(mediaUrl);
  
  const { buffer, contentType } = imageData;
  const base64Image = buffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64Image}`;
  
  const category = await quickClassifyImage(dataUrl);
  
  const analysis = await analyzeWithOptimizedPrompt(dataUrl, category, context);
  
  let matchedFaces: FaceMatch[] | undefined;
  
  if ((category === "selfie" || category === "people_photo") && analysis.personAnalysis) {
    try {
      const faceDescriptions = extractFaceDescriptions(analysis.personAnalysis);
      
      if (faceDescriptions.length > 0) {
        const allMatches: FaceMatch[] = [];
        
        for (const faceDesc of faceDescriptions) {
          const matches = await matchFaceToContacts(faceDesc);
          allMatches.push(...matches);
        }
        
        if (allMatches.length > 0) {
          matchedFaces = allMatches;
          console.log(`[MMS] Matched ${allMatches.length} face(s) to contacts`);
        }
      }
    } catch (faceError: any) {
      console.warn(`[MMS] Face matching failed (non-fatal): ${faceError.message}`);
    }
  }
  
  let storedImageId: string | undefined;
  let storedImagePath: string | undefined;
  
  if (analysis.confidence > 0) {
    try {
      const storedImage = await processAndStoreMmsImage(
        buffer,
        contentType,
        mediaUrl,
        analysis,
        {
          senderPhone: context.senderPhone,
          senderName: context.senderName,
          conversationId: context.conversationId,
          messageText: context.messageText,
        }
      );
      
      if (storedImage) {
        storedImageId = storedImage.id;
        storedImagePath = storedImage.objectPath;
      }
    } catch (storageError: any) {
      console.warn(`[MMS] Storage failed (non-fatal): ${storageError.message}`);
    }
  }
  
  const processingTimeMs = Date.now() - startTime;
  console.log(`[MMS] Complete: ${category} in ${processingTimeMs}ms`);
  
  return {
    analysis,
    storedImageId,
    storedImagePath,
    category,
    processingTimeMs,
    matchedFaces,
  };
}

async function loadMmsContext(
  senderPhone: string,
  conversationId: string
): Promise<{
  senderName?: string;
  recentMessages?: Array<{ role: string; content: string }>;
  contactInfo?: { name?: string; tags?: string[]; notes?: string };
} | null> {
  try {
    const contact = getContactByPhone(senderPhone);
    
    const messages = getRecentMessages(conversationId, 10);
    const recentMessages = messages.map(m => ({
      role: m.role,
      content: m.content.substring(0, 200),
    }));
    
    return {
      senderName: contact ? getContactFullName(contact) : undefined,
      recentMessages,
      contactInfo: contact ? {
        name: getContactFullName(contact),
        tags: contact.tags || [],
        notes: contact.notes || undefined,
      } : undefined,
    };
  } catch (error: any) {
    console.error("[MMS] Context load error:", error.message);
    return null;
  }
}

export async function processParallelMmsImage(
  mediaUrl: string,
  senderPhone: string,
  conversationId: string,
  messageText?: string
): Promise<MmsProcessingResult> {
  console.log(`[MMS] Starting parallel processing for ${senderPhone}`);
  
  const [imageData, contextData] = await Promise.all([
    downloadMmsImage(mediaUrl).catch(err => {
      console.error("[MMS] Download failed:", err.message);
      return null;
    }),
    loadMmsContext(senderPhone, conversationId).catch(err => {
      console.error("[MMS] Context load failed:", err.message);
      return null;
    }),
  ]);
  
  if (!imageData) {
    throw new Error("Failed to download MMS image");
  }
  
  const context: MmsContext = {
    senderPhone,
    senderName: contextData?.senderName,
    conversationId,
    messageText,
    recentMessages: contextData?.recentMessages,
    contactInfo: contextData?.contactInfo,
  };
  
  return processImageWithContext(mediaUrl, context, imageData);
}

export async function processMmsImages(
  mediaUrls: Array<{ url: string; contentType: string }>,
  senderPhone: string,
  conversationId: string,
  messageText?: string
): Promise<MmsProcessingResult[]> {
  const imageUrls = mediaUrls.filter(m => m.contentType.startsWith("image/"));
  
  if (imageUrls.length === 0) {
    return [];
  }
  
  console.log(`[MMS] Processing batch of ${imageUrls.length} image(s)`);
  
  const [contextData, ...imageDownloads] = await Promise.all([
    loadMmsContext(senderPhone, conversationId).catch(err => {
      console.error("[MMS] Context load failed:", err.message);
      return null;
    }),
    ...imageUrls.map(media => 
      downloadMmsImage(media.url).catch(err => {
        console.error(`[MMS] Download failed for ${media.url}:`, err.message);
        return null;
      })
    ),
  ]);
  
  const context: MmsContext = {
    senderPhone,
    senderName: contextData?.senderName,
    conversationId,
    messageText,
    recentMessages: contextData?.recentMessages,
    contactInfo: contextData?.contactInfo,
  };
  
  const results: MmsProcessingResult[] = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const imageData = imageDownloads[i];
    const mediaUrl = imageUrls[i].url;
    
    if (!imageData) {
      results.push({
        analysis: { description: "Image download failed", confidence: 0 },
        category: "unknown" as ImageCategory,
        processingTimeMs: 0,
      });
      continue;
    }
    
    try {
      const result = await processImageWithContext(mediaUrl, context, imageData);
      results.push(result);
    } catch (err: any) {
      console.error(`[MMS] Failed to process image: ${err.message}`);
      results.push({
        analysis: { description: "Image processing failed", confidence: 0 },
        category: "unknown" as ImageCategory,
        processingTimeMs: 0,
      });
    }
  }
  
  return results;
}
