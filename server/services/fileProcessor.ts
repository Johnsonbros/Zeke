import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { getUploadedFile, updateUploadedFile } from "../db";
import type { UploadedFile, UpdateUploadedFile } from "@shared/schema";
import { getTwilioApiCredentials } from "../twilioClient";

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

export interface ContactInfo {
  phoneNumbers?: string[];
  emails?: string[];
  addresses?: string[];
  names?: string[];
}

export interface ImageAnalysisResult {
  description: string;
  extractedText?: string;
  contactInfo?: ContactInfo;
  objects?: string[];
  tags?: string[];
  colors?: string[];
  confidence: number;
}

export interface PersonPhotoAnalysisResult {
  hasPeople: boolean;
  peopleCount: number;
  peopleDescriptions: Array<{
    position: string;
    description: string;
    estimatedAge?: string;
    gender?: string;
    clothing?: string;
    distinguishingFeatures?: string;
  }>;
  setting: string;
  occasion?: string;
  suggestedMemory?: string;
  suggestedContactUpdate?: {
    personDescription: string;
    suggestedNotes: string;
  };
}

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  info?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
}

export async function analyzeImage(fileId: string): Promise<ImageAnalysisResult> {
  const file = getUploadedFile(fileId);
  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  if (file.fileType !== "image") {
    throw new Error(`File is not an image: ${file.fileType}`);
  }

  updateUploadedFile(fileId, { processingStatus: "processing" });

  try {
    const filePath = path.resolve(process.cwd(), file.path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found on disk: ${filePath}`);
    }

    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = file.mimeType || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image in detail. Provide:
1. A comprehensive description of what you see
2. Any text visible in the image (OCR)
3. Key objects or elements identified
4. Relevant tags or categories
5. Dominant colors if notable

Respond in JSON format:
{
  "description": "detailed description",
  "extractedText": "any text found in the image or null",
  "objects": ["list", "of", "objects"],
  "tags": ["relevant", "tags"],
  "colors": ["dominant", "colors"],
  "confidence": 0.95
}`,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "";
    
    let result: ImageAnalysisResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = {
          description: content,
          confidence: 0.7,
        };
      }
    } catch {
      result = {
        description: content,
        confidence: 0.7,
      };
    }

    const updateData: UpdateUploadedFile = {
      processingStatus: "completed",
      extractedText: result.extractedText || null,
      analysisResult: JSON.stringify(result),
    };
    updateUploadedFile(fileId, updateData);

    return result;
  } catch (error: any) {
    updateUploadedFile(fileId, {
      processingStatus: "failed",
      processingError: error.message || "Unknown error during image analysis",
    });
    throw error;
  }
}

export async function extractPdfText(fileId: string): Promise<PdfExtractionResult> {
  const file = getUploadedFile(fileId);
  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  if (file.fileType !== "pdf") {
    throw new Error(`File is not a PDF: ${file.fileType}`);
  }

  updateUploadedFile(fileId, { processingStatus: "processing" });

  try {
    const filePath = path.resolve(process.cwd(), file.path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found on disk: ${filePath}`);
    }

    const pdfParseModule = await import("pdf-parse") as any;
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    const result: PdfExtractionResult = {
      text: pdfData.text,
      pageCount: pdfData.numpages,
      info: {
        title: pdfData.info?.Title,
        author: pdfData.info?.Author,
        subject: pdfData.info?.Subject,
        keywords: pdfData.info?.Keywords,
      },
    };

    const updateData: UpdateUploadedFile = {
      processingStatus: "completed",
      extractedText: result.text,
      pageCount: result.pageCount,
      analysisResult: JSON.stringify({
        info: result.info,
        textLength: result.text.length,
        pageCount: result.pageCount,
      }),
    };
    updateUploadedFile(fileId, updateData);

    return result;
  } catch (error: any) {
    updateUploadedFile(fileId, {
      processingStatus: "failed",
      processingError: error.message || "Unknown error during PDF extraction",
    });
    throw error;
  }
}

export async function processFile(fileId: string): Promise<ImageAnalysisResult | PdfExtractionResult> {
  const file = getUploadedFile(fileId);
  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  switch (file.fileType) {
    case "image":
      return analyzeImage(fileId);
    case "pdf":
      return extractPdfText(fileId);
    default:
      throw new Error(`Unsupported file type for processing: ${file.fileType}`);
  }
}

export function getFileAnalysis(fileId: string): ImageAnalysisResult | PdfExtractionResult | null {
  const file = getUploadedFile(fileId);
  if (!file || !file.analysisResult) {
    return null;
  }

  try {
    return JSON.parse(file.analysisResult);
  } catch {
    return null;
  }
}

export async function analyzeImageFromUrl(
  imageUrl: string,
  context?: { senderName?: string; senderPhone?: string; messageText?: string }
): Promise<ImageAnalysisResult & { personAnalysis?: PersonPhotoAnalysisResult }> {
  const client = getOpenAIClient();

  const contextInfo = context 
    ? `The sender ${context.senderName ? `(${context.senderName})` : ""} sent this image${context.messageText ? ` with the message: "${context.messageText}"` : ""}.`
    : "";

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this image in detail. ${contextInfo}

CRITICAL: Your #1 priority is to extract ALL text, numbers, and contact information visible in the image with 100% accuracy. This includes:
- Phone numbers (in any format: xxx-xxx-xxxx, (xxx) xxx-xxxx, +1xxxxxxxxxx, etc.)
- Email addresses
- Physical addresses (street, city, state, zip)
- Names of people or businesses
- Any other alphanumeric text

Transcribe ALL visible text EXACTLY as shown - do not paraphrase or summarize text content.

Additionally provide:
1. A detailed description of what you see
2. Key objects or elements identified
3. If there are people in the image, describe each person in detail:
   - Their position in the photo (left, right, center, etc.)
   - Physical description (don't try to identify them unless the sender mentioned names)
   - Clothing and any distinguishing features
   - What they appear to be doing
4. The setting/location and any apparent occasion (holiday, celebration, etc.)
5. Suggest what memory could be created from this photo
6. If the sender mentioned who is in the photo, note that for contact updates

Respond in JSON format:
{
  "description": "detailed description of the entire image",
  "extractedText": "ALL text found in the image, transcribed exactly - never null if any text is visible",
  "contactInfo": {
    "phoneNumbers": ["array of all phone numbers found"],
    "emails": ["array of all email addresses found"],
    "addresses": ["array of all physical addresses found"],
    "names": ["array of all person/business names found"]
  },
  "objects": ["list", "of", "key objects"],
  "tags": ["relevant", "tags"],
  "colors": ["dominant", "colors"],
  "confidence": 0.95,
  "personAnalysis": {
    "hasPeople": true/false,
    "peopleCount": number,
    "peopleDescriptions": [
      {
        "position": "left/center/right",
        "description": "physical description",
        "estimatedAge": "age range",
        "gender": "if apparent",
        "clothing": "what they're wearing",
        "distinguishingFeatures": "notable features like beard, glasses, etc."
      }
    ],
    "setting": "where the photo was taken",
    "occasion": "apparent occasion if any (Christmas, birthday, etc.)",
    "suggestedMemory": "A suggested memory note based on this photo",
    "suggestedContactUpdate": {
      "personDescription": "which person in the photo if sender identified them",
      "suggestedNotes": "notes about appearance/context to add to contact"
    }
  }
}`,
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "";

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Failed to parse image analysis JSON:", e);
  }

  return {
    description: content,
    confidence: 0.7,
  };
}

export async function downloadMmsImage(
  mediaUrl: string,
  twilioAccountSid?: string,
  twilioAuthToken?: string
): Promise<{ buffer: Buffer; contentType: string }> {
  let username: string;
  let password: string;

  if (twilioAccountSid && twilioAuthToken) {
    // Use provided credentials (e.g., from webhook context)
    username = twilioAccountSid;
    password = twilioAuthToken;
  } else {
    // Use Replit connector credentials
    try {
      const creds = await getTwilioApiCredentials();
      username = creds.apiKey;
      password = creds.apiKeySecret;
    } catch (error) {
      throw new Error("Twilio credentials not configured for MMS download");
    }
  }

  const authHeader = Buffer.from(`${username}:${password}`).toString("base64");

  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download MMS media: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") || "image/jpeg";

  return { buffer, contentType };
}

export async function analyzeMmsImage(
  mediaUrl: string,
  context?: { senderName?: string; senderPhone?: string; messageText?: string }
): Promise<ImageAnalysisResult & { personAnalysis?: PersonPhotoAnalysisResult }> {
  try {
    const { buffer, contentType } = await downloadMmsImage(mediaUrl);
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${contentType};base64,${base64Image}`;

    return await analyzeImageFromUrl(dataUrl, context);
  } catch (error: any) {
    console.error("Error analyzing MMS image:", error);
    throw error;
  }
}
