import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for URL research
  app.get("/api/research", async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(response.data);
      
      const title = $("title").text();
      const description = $("meta[name='description']").attr("content") || "";
      const h1s = $("h1").map((_, el) => $(el).text()).get().join(", ");
      
      // Try to find some color-related info in styles if possible, but simple summary is better
      const researchSummary = `
        Title: ${title}
        Description: ${description}
        Main Headings: ${h1s}
      `.trim();

      res.json({ summary: researchSummary });
    } catch (error) {
      console.error("Research failed:", error);
      res.status(500).json({ error: "Could not analyze website" });
    }
  });

  // API Route for Image Generation with gemini-2.5-flash-image
  app.post("/api/generate-image", async (req, res) => {
    const { prompt, aspectRatio, clientKey } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const keyToUse = clientKey || process.env.GEMINI_API_KEY;
    if (!keyToUse) {
      return res.status(401).json({ error: "Missing Gemini API Key. Please provide your browser API Key by clicking the 🔑 key icon in the upper right header." });
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const aiTemp = new GoogleGenAI({
        apiKey: keyToUse,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await aiTemp.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio || "16:9"
          }
        }
      });

      let base64Image = "";
      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
          }
        }
      }

      if (!base64Image) {
        return res.status(500).json({ error: "API returned no visual bytes. Prompt might have triggered safety filters. Try editing or simplifying your prompt." });
      }

      res.json({ imageUrl: `data:image/png;base64,${base64Image}` });
    } catch (error: any) {
      console.error("Server image generation failed:", error);
      res.status(500).json({ error: error.message || "Failed to generate image" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
