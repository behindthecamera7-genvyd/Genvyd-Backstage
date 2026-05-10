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
