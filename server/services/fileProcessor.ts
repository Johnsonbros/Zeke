import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { getUploadedFile, updateUploadedFile } from "../db";
import type { UploadedFile, UpdateUploadedFile } from "@shared/schema";

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

export interface ImageAnalysisResult {
  description: string;
  extractedText?: string;
  objects?: string[];
  tags?: string[];
  colors?: string[];
  confidence: number;
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
