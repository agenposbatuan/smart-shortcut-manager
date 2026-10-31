
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiLinkAnalysis } from "../types";

let aiInstance: GoogleGenAI | null = null;

const getAIInstance = (): GoogleGenAI | null => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export const analyzeLink = async (url: string): Promise<GeminiLinkAnalysis> => {
  let fallbackTitle = url;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    fallbackTitle = parsed.hostname.replace(/^www\./i, '').toUpperCase();
  } catch {
    fallbackTitle = url.toUpperCase();
  }

  const ai = getAIInstance();
  if (!ai) {
    return {
      title: fallbackTitle,
      description: "Auto-analysis requires GEMINI_API_KEY.",
      category: "GENERAL",
      tags: [],
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze this URL and provide a professional title, short description (max 100 chars), a single primary category, and 3 relevant tags. URL: ${url}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            tags: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
          },
          required: ["title", "description", "category", "tags"],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      title: result.title || fallbackTitle,
      description: result.description || "No description available.",
      category: result.category || "GENERAL",
      tags: result.tags || [],
    };
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      title: fallbackTitle,
      description: "Unable to analyze link automatically.",
      category: "GENERAL",
      tags: [],
    };
  }
};
