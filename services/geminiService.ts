import { GoogleGenAI, Type } from "@google/genai";
import { Contact, SearchResult } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Helper Types for Schema ---

// --- 1. Extraction Service ---
export const extractContactFromText = async (text: string): Promise<Partial<Contact>> => {
  // Check if the text contains a URL
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const hasUrl = urlRegex.test(text);

  // If URL is present, we MUST use the googleSearch tool.
  // API Rule: specific tools (googleSearch) cannot be combined with responseSchema/responseMimeType.
  if (hasUrl) {
    const prompt = `
    The user provided the following input containing a URL:
    "${text}"

    Please use Google Search to access the content of this link. 
    Task: Identify the PRIMARY person described in the content (core personnel) and extract their professional profile.
    
    If multiple people are mentioned, select the main subject of the page.
    Infer 'relatedPeople' found in the context (e.g., colleagues, advisors).

    You MUST return the output as a raw JSON string (no markdown formatting) matching this structure exactly:
    {
      "name": "string",
      "title": "string (e.g. Job Title)",
      "company": "string (Organization/Company)",
      "email": "string (optional)",
      "phone": "string (optional)",
      "location": "string",
      "tags": ["string", "string"],
      "summary": "string (Professional biography based on the page content)",
      "relatedPeople": [
        { "name": "string", "relationship": "string" }
      ]
    }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType and responseSchema are NOT allowed with googleSearch
      }
    });

    let jsonStr = response.text || "{}";
    // Clean up potential markdown code blocks provided by the model
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse Gemini response from URL search", e);
      throw new Error("Failed to extract info from URL. Please try again or copy text manually.");
    }

  } else {
    // Original Logic: Text-only extraction using strict Schema (Faster/More reliable for raw text)
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract person information from the following text. Infer related people if mentioned. 
      Text: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            title: { type: Type.STRING },
            company: { type: Type.STRING },
            email: { type: Type.STRING },
            phone: { type: Type.STRING },
            location: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            summary: { type: Type.STRING, description: "A brief professional biography based on the text." },
            relatedPeople: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  relationship: { type: Type.STRING }
                }
              }
            }
          },
          required: ["name", "summary", "tags"]
        }
      }
    });

    const jsonStr = response.text || "{}";
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse Gemini response", e);
      throw new Error("AI 解析失败，请重试");
    }
  }
};

// --- 2. Search Grounding Service ---
export const searchPersonInfo = async (name: string, company: string): Promise<{ summary: string; sources: SearchResult[] }> => {
  const query = `
  请在互联网上搜索关于 "${company}" 的 "${name}" 的最新职业动态、个人简历和背景信息。
  请务必用【中文】列出关于他的 5 条关键信息（例如：主要职业成就、近期参加的活动、担任的具体职务、教育背景、或重要的合作伙伴/机构）。
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: query,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "";
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  const sources: SearchResult[] = groundingChunks
    .filter((chunk: any) => chunk.web?.uri)
    .map((chunk: any) => ({
      title: chunk.web?.title || "Web Source",
      snippet: "Click to visit source",
      url: chunk.web?.uri,
      source: new URL(chunk.web?.uri).hostname
    }));

  // Remove duplicates based on URL
  const uniqueSources = Array.from(new Map(sources.map(item => [item.url, item])).values());

  return {
    summary: text,
    sources: uniqueSources
  };
};

// --- 3. Enrichment/Merge Service (Multi-modal) ---
export interface EnrichmentContext {
  webSummary?: string;
  validSources?: SearchResult[];
  manualText?: string;
  manualImages?: string[]; // Base64 strings (image/jpeg or png)
}

export const enrichContactProfile = async (currentContact: Contact, context: EnrichmentContext): Promise<Contact> => {
  const parts: any[] = [];
  let useSearchTool = false;

  // 1. Instructions
  let promptText = `
  Task: Update the existing contact profile by merging new information provided below.
  
  Existing Profile JSON:
  ${JSON.stringify(currentContact)}
  
  Instructions:
  1. Enhance the 'summary' to be comprehensive.
  2. Add new 'tags' if relevant skills are found.
  3. Update 'title', 'company', 'email', 'phone' if better info is found.
  4. CRITICAL: Extract ALL related people/orgs.
  5. Keep the ID unchanged.
  6. Return ONLY the JSON object. No markdown formatting.
  `;

  // 2. Add Web Context
  if (context.webSummary) {
    promptText += `\n\n--- Web Search Information ---\n${context.webSummary}`;
    if (context.validSources && context.validSources.length > 0) {
      // Improved: Include source domain for better context
      promptText += `\n\nIMPORTANT: Only consider information validated by these sources: ${context.validSources.map(s => `${s.title} (${s.source})`).join(", ")}. Ignore conflicting info from other sources.`;
    }
  }

  // 3. Add Manual Text Context (Supports URLs)
  if (context.manualText) {
    promptText += `\n\n--- User Provided Notes/Resume/URL ---\n${context.manualText}`;
    
    // Heuristic: If text contains a URL, enable search tool to allow Gemini to visit it.
    if (context.manualText.match(/https?:\/\//)) {
      useSearchTool = true;
      promptText += `\n\n(The user provided URLs in the text above. Please search/visit them to extract relevant profile details.)`;
    }
  }

  // Add the text part to the payload
  parts.push({ text: promptText });

  // 4. Add Image Parts (e.g., Resume screenshots)
  if (context.manualImages && context.manualImages.length > 0) {
    context.manualImages.forEach(base64Data => {
      // Strip prefix if present (e.g., "data:image/jpeg;base64,")
      const cleanData = base64Data.split(',')[1] || base64Data;
      parts.push({
        inlineData: {
          mimeType: "image/jpeg", // Assuming JPEG for simplicity
          data: cleanData
        }
      });
    });
    parts.push({ text: "\n\n(Refer to the attached images for additional profile details, such as resume content)" });
  }

  // 5. Config Setup
  const requestConfig: any = {};
  
  if (useSearchTool) {
    // If using Search tool (for URLs), we cannot strictly enforce responseMimeType: 'application/json' in config.
    // We rely on the prompt to request JSON.
    requestConfig.tools = [{ googleSearch: {} }];
  } else {
    // If no tools are used, we can strictly enforce JSON schema for reliability.
    requestConfig.responseMimeType = "application/json";
    requestConfig.responseSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        title: { type: Type.STRING },
        company: { type: Type.STRING },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        location: { type: Type.STRING },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        summary: { type: Type.STRING },
        relatedPeople: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              relationship: { type: Type.STRING }
            }
          }
        }
      }
    };
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash", // Supports multi-modal & tools
    contents: { parts: parts },
    config: requestConfig
  });

  let jsonStr = response.text || "{}";
  
  // Cleanup potential markdown if tools were used
  jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const updates = JSON.parse(jsonStr);
    return { ...currentContact, ...updates };
  } catch (e) {
    console.error("Merge failed", e, jsonStr);
    // Fallback: return original if parsing fails
    return currentContact;
  }
};

// --- 4. Intelligent Merge Service (Multi-profile) ---
export const mergeContactsSmartly = async (contacts: Contact[]): Promise<Contact> => {
  if (contacts.length === 0) throw new Error("No contacts to merge");
  if (contacts.length === 1) return contacts[0];

  const targetId = contacts[0].id; // Keep the ID of the first selected
  const prompt = `
  I have these contact profiles that represent the SAME person. 
  Please merge them into one single, comprehensive profile.
  
  Profiles:
  ${JSON.stringify(contacts)}
  
  Instructions:
  1. Use the most complete 'name'.
  2. Use the most recent or impressive 'title' and 'company'.
  3. Combine unique 'tags'.
  4. Combine 'relatedPeople', removing duplicates.
  5. Merge the 'summary'.
  6. Return a single JSON object.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          title: { type: Type.STRING },
          company: { type: Type.STRING },
          email: { type: Type.STRING },
          phone: { type: Type.STRING },
          location: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
          relatedPeople: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                relationship: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });

  const jsonStr = response.text || "{}";
  try {
    const mergedData = JSON.parse(jsonStr);
    return { ...mergedData, id: targetId, notes: contacts.map(c => c.notes).join('\n\n') };
  } catch (e) {
    console.error("Smart merge failed", e);
    return contacts[0];
  }
};