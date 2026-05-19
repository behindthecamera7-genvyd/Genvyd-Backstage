import { GoogleGenAI } from "@google/genai";
import { BrandReport, Shot } from "./types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. AI features will be disabled.");
      // Create a dummy instance or handle it gracefully in calls
      aiInstance = new GoogleGenAI({ apiKey: "MISSING_KEY" }); 
    } else {
      aiInstance = new GoogleGenAI({ apiKey });
    }
  }
  return aiInstance;
}

export async function generateBrandReport(script: string, websiteUrl?: string, visualTheme?: string, researchContext: string = ""): Promise<BrandReport> {
  const ai = getAI();
  const prompt = `
    You are the Genvyd Production Architect. 
    Analyze the following brand context. 
    
    Website (for research): "${websiteUrl || 'Not provided'}"
    Visual Theme/Vibe: "${visualTheme || 'Not provided'}"
    Research Data: "${researchContext}"
    Script: "${script}"
    
    Identify the company's "Heroic Intent" and aesthetic markers.
    Follow the "David Clark Way" (intersection of Christopher Nolan's grounded realism and James Cameron's high-spectacle).
    
    Return the result in JSON format:
    {
      "mission": "The 'Heroic Intent' summary",
      "motifs": ["list", "of", "visual", "motifs"],
      "cinematicProfile": {
        "lighting": "Technical breakdown of lighting strategy (e.g., Chiaroscuro, Volumetric Fog)",
        "palette": "Technical palette description (e.g., Industrial Cyan, Gold Hour)",
        "lens": "Lens and sensor strategy (Arri Alexa, Panavision Anamorphic, T-Stop 2.0, etc.)"
      },
      "narrativeAnchor": "The non-negotiable core message",
      "targetSoftware": "Suggested AI image/video generator (e.g., Midjourney v6, Runway Gen-3, Kling, Luma Dream Machine)",
      "characterDescription": "A technical description of a recurring protagonist if applicable"
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}") as BrandReport;
}

export async function generateShotSequence(script: string, brandReport: BrandReport): Promise<Shot[]> {
  const ai = getAI();
  const prompt = `
    You are a Film Director. Break the following script into a production shot list (sub-shot architecture).
    
    Script: "${script}"
    Brand Mission: ${brandReport.mission}
    Target Software: ${brandReport.targetSoftware}
    Cinematic Profile: ${JSON.stringify(brandReport.cinematicProfile)}
    Global Character: ${brandReport.characterDescription || "N/A"}
    
    Architecture Rules:
    - Organize into beats (1, 2, 3...).
    - Each beat must have nested rows: "a" shots (Establishing/Narrative Wides) and "b" shots (Detail/Glitch/UI Closely-ups).
    - Image Prompts MUST be exhaustive and technical (e.g., Arri Alexa, Panavision Anamorphic, T-Stop 2.0, Chiaroscuro). 
    - MANDATORY: Begin every Image Prompt with a mention of the platform style optimization (e.g., "Photorealistic Midjourney v6 style:", "Cinematic Runway Gen-3 rendering:").
    - Character Consistency: If a shot features a main character, you MUST include the Global Character description exactly to maintain visual continuity.
    - DO NOT use the phrase "David Clark Style" in the prompts, just apply the technical aesthetic.
    - Contextual Accuracy: 
      - "Legacy" sections: Gritty, distorted, shadows, high-contrast.
      - "Wheelio" sections: Clean, heroic, anamorphic, polished.
    
    Example of High-Quality Shot Architecture:
    Shot 1a (Establishing Wide):
    Image Prompt: "A wide, cinematic establishing shot of a desolate, weathered asphalt road stretching toward a smog-choked horizon. The lighting is high-contrast Chiaroscuro with deep, heavy shadows and thick volumetric fog rolling across the ground. Captured on Arri Alexa with Panavision Anamorphic lenses, T-Stop 1.8. The color palette is a sickly, monochromatic industrial grey with flickering, overhead fluorescent light casting harsh glares on oily puddles."
    Motion Prompt: "A slow, deliberate dolly forward at 24fps. The camera should feel heavy and grounded. Introduce subtle, erratic particle glitches in the air to represent 'digital friction,' with a slight handheld shake to emphasize the discomfort of the legacy marketplace."
    
    Shot 1b (Detail/Glitch):
    Image Prompt: "An extreme close-up (ECU) on a 'Phantom Vehicle.' The car is a flickering, translucent silhouette, barely holding form against a dark, rainy backdrop. Master Prime 35mm lens, T-Stop 1.4, creating an ultra-shallow depth of field where only the glitching headlight is in sharp focus. Deep shadows dominate the frame, with sharp, blue rim lighting defining the car's edge."
    Motion Prompt: "A static shot with high-shutter speed motion. The vehicle silhouette should 'stutter' and glitch frame-by-frame, creating a sense of visual data corruption. Use a rapid Z-axis micro-jitter to simulate the frustration of 'phantom inventory.'"

    Return a list of JSON objects matching the Shot interface structure:
    [{
      "id": "unique_string",
      "index": "1a",
      "title": "Short descriptive title",
      "type": "establishing | detail | glitch | narrative",
      "versions": [{
        "id": "unique_version_id",
        "imagePrompt": "Exhaustive technical prompt...",
        "motionPrompt": "Specific animation instructions...",
        "timestamp": 123456789
      }],
      "selectedVersionId": "unique_version_id",
      "dialogue": "The voiceover or dialogue text for this specific shot",
      "notes": "Director's production notes",
      "context": "Legacy | Wheelio | Transition"
    }]
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  const parsed = JSON.parse(response.text || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

export async function regenerateShotPrompt(shot: Shot, brandReport: BrandReport, ideas?: string): Promise<{ image: string; motion: string }> {
  const ai = getAI();
  
  let characterInfo = brandReport.characterDescription || "N/A";
  if (shot.characterId && brandReport.characters) {
    const char = brandReport.characters.find(c => c.id === shot.characterId);
    if (char) {
      characterInfo = `Character [Name: ${char.name}]: ${char.description}`;
    }
  }

  const prompt = `
    You are a Film Director. Regenerate the image and motion prompts for this shot based on the following context.
    
    Current Shot Info:
    Index: ${shot.index}
    Title: ${shot.title}
    Type: ${shot.type}
    Context: ${shot.context}
    Target Software: ${brandReport.targetSoftware}
    Brand Mission: ${brandReport.mission}
    Cinematic Profile: ${JSON.stringify(brandReport.cinematicProfile)}
    Global Character / Specific Character Details: ${characterInfo}
    Is Same Character Shot: ${shot.isCharacterShot ? "YES" : "NO"}
    
    User Ideas/Feedback: "${ideas || "Improve the cinematic quality and technical detail"}"
    
    Rules:
    - Image Prompts MUST be exhaustive and technical (Arri Alexa, T-Stop 2.0, etc.).
    - Optimization: Optimize for ${brandReport.targetSoftware}.
    - Character Consistency: If 'Is Same Character Shot' is YES or a Specific Character is chosen, you MUST include the Character Details exactly to maintain visual continuity.
    - DO NOT use the phrase "David Clark Style".
    - Focus on high-contrast realism and cinematic spectacle.
    
    Return JSON:
    {
      "image": "Exhaustive technical image prompt...",
      "motion": "Specific animation instructions..."
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(response.text || "{}") as { image: string; motion: string };
}

export async function refineAllPrompts(shots: Shot[], report: BrandReport, styleDirective: string): Promise<{ shotId: string, imagePrompt: string, motionPrompt: string }[]> {
  const ai = getAI();
  
  const charactersList = report.characters && report.characters.length > 0 
    ? report.characters.map((c, idx) => `${idx + 1}. [ID: ${c.id}] Name: ${c.name}, Description: ${c.description}`).join("\n")
    : "Only default character: " + (report.characterDescription || "N/A");

  const prompt = `
    You are the Genvyd Creative Director. 
    We have a complete shot sequence, but we need to adjust the overall STYLE/VIBE while keeping the actual content/actions the same.
    
    BRAND CONTEXT:
    - Mission: ${report.mission}
    - Target Software: ${report.targetSoftware}
    - Cinematic Profile: ${JSON.stringify(report.cinematicProfile)}
    - Available Characters for Consistency:
${charactersList}
    
    NEW STYLE DIRECTIVE / GLOBAL REFINEMENT: "${styleDirective}"
    
    CURRENT SHOT SEQUENCE:
    ${shots.map(s => {
      const v = s.versions.find(v => v.id === s.selectedVersionId) || s.versions[0];
      let charInfo = "N/A";
      if (s.characterId && report.characters) {
        const char = report.characters.find(c => c.id === s.characterId);
        if (char) {
          charInfo = `Character Selected: "${char.name}" with details: "${char.description}"`;
        }
      } else if (s.isCharacterShot) {
        charInfo = `Global Character: "${report.characterDescription || "N/A"}"`;
      }
      return `Shot ${s.index} (ID: ${s.id}, Title: ${s.title}, Character Shot: ${s.isCharacterShot ? 'YES' : 'NO'}, Featured Character: ${charInfo}):\n- Image: ${v.imagePrompt}\n- Motion: ${v.motionPrompt}`;
    }).join("\n\n")}
    
    TASK:
    Rewrite the image and motion prompts for EVERY shot to align with the NEW STYLE DIRECTIVE.
    Keep the core narrative and subjects, but change the lighting, framing, texture, and motion energy to match the directive.
    Always anchor prompts to ${report.targetSoftware} optimization.
    Maintain Character Consistency if a character is featured in the shot by using their exact physical details / description.
    Maintain technical specificity (e.g., lens types, lighting techniques).
    
    RETURN A JSON ARRAY:
    [{ "shotId": "original_shot_id", "imagePrompt": "new prompt", "motionPrompt": "new prompt" }]
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "[]";
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Fallback: try to extract anything that looks like an array
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("Invalid JSON refinement response");
      }
    }

    // Handle case where AI wraps array in an object
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
      const keys = Object.keys(parsed);
      for (const key of keys) {
        if (Array.isArray(parsed[key])) {
          parsed = parsed[key];
          break;
        }
      }
    }

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to refine all prompts:", error);
    throw error;
  }
}

export async function generateStyleSpec(directive: string, scriptContext?: string): Promise<{
  targetSoftware: string;
  cinematicProfile: { lighting: string; palette: string; lens: string };
  motifs: string[];
  characterDescription?: string;
}> {
  const ai = getAI();
  const prompt = `
    You are a professional Creative Director. 
    A user wants to establish a specific style and vibe for their storyboard/film production.
    They gave this style cue/directive: "${directive}"
    ${scriptContext ? `The script/narrative is: "${scriptContext}"` : ""}
    
    Synthesize this styling cue into rigorous film specs:
    1. 'lighting': Detailed lighting strategy (e.g. "Warm diffused key lights, bright corporate key, soft fill with minimal shadows")
    2. 'palette': Atmosphere, texture and color scheme (e.g. "Clean bright whites, vibrant pastel accents, high-key illumination")
    3. 'lens': Camera gear and optics setup (e.g. "Arri Alexa, spherical 35mm primes, clean high-sharpness sensor")
    4. 'motifs': 3 to 5 visual elements or props matching this style (e.g. ["clean glass whiteboards", "brushed aluminum laptops", "sun-drenched windows", "indoor plants"])
    5. 'targetSoftware': Optimal generative model (e.g. "Midjourney v6" or "Runway Gen-3")
    6. 'characterDescription': Describe a primary protagonist matching this aesthetic style if they want a consistent character (e.g. "An elegant professional in a light grey tailored blazer with a warm smiles")
    
    Return the response as a strict JSON object:
    {
      "targetSoftware": "...",
      "cinematicProfile": {
        "lighting": "...",
        "palette": "...",
        "lens": "..."
      },
      "motifs": ["...", "..."],
      "characterDescription": "..."
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Failed to generate style spec:", error);
    // Return a sensible fallback in case of errors
    return {
      targetSoftware: "Midjourney v6",
      cinematicProfile: {
        lighting: "Bright high-key natural illumination",
        palette: "Clean white base, light corporate pastel tones",
        lens: "Spherical prime lenses, sharp 35mm, crisp focus"
      },
      motifs: ["clean workspaces", "bright studio light", "subtle lens flares"],
      characterDescription: ""
    };
  }
}


