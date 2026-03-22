import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { Anthropic } from "@anthropic-ai/sdk";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Ensure uploads directory exists
const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/x-m4a", "audio/aac", "video/mp4"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|webm|m4a|aac|mp4)$/i) !== null);
  },
});

export async function registerRoutes(httpServer: Server, app: Express) {
  // --- Songs ---
  app.get("/api/songs", (_req, res) => {
    const songs = storage.getSongs();
    res.json(songs);
  });

  app.get("/api/songs/:id", (req, res) => {
    const song = storage.getSong(Number(req.params.id));
    if (!song) return res.status(404).json({ error: "Song not found" });
    res.json(song);
  });

  app.post("/api/songs", (req, res) => {
    const song = storage.createSong({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(song);
  });

  app.delete("/api/songs/:id", (req, res) => {
    storage.deleteSong(Number(req.params.id));
    res.json({ ok: true });
  });

  // --- Audio Upload ---
  app.post("/api/upload-audio", upload.single("audio"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const ext = path.extname(req.file.originalname).toLowerCase() || ".mp3";
    const dest = req.file.path + ext;
    fs.renameSync(req.file.path, dest);
    res.json({ filePath: dest, originalName: req.file.originalname });
  });

  // --- YouTube Audio Extract ---
  app.post("/api/youtube-extract", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });

    try {
      // Get video metadata (title + artist/track when available)
      let titleStr = "";
      let parsedArtist = "";
      let parsedTrack = "";
      try {
        const metaJson = execSync(
          `yt-dlp --dump-json --no-download "${url}"`,
          { encoding: "utf-8", timeout: 30000 }
        );
        const meta = JSON.parse(metaJson);
        titleStr = meta.track || meta.title || "";
        parsedArtist = meta.artist || meta.creator || meta.uploader || meta.channel || "";
        parsedTrack = meta.track || "";

        // If no track metadata, try to parse "Artist - Title" from video title
        if (!parsedTrack && meta.title) {
          const dashMatch = meta.title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
          if (dashMatch) {
            parsedArtist = parsedArtist || dashMatch[1].trim();
            parsedTrack = dashMatch[2].trim()
              .replace(/\s*\(.*?(official|video|audio|lyrics|hd|hq|4k|visualizer|remaster).*?\)/gi, "")
              .replace(/\s*\[.*?(official|video|audio|lyrics|hd|hq|4k|visualizer|remaster).*?\]/gi, "")
              .trim();
            titleStr = parsedTrack || titleStr;
          }
        }
      } catch {
        // Fallback: just get the title
        titleStr = execSync(`yt-dlp --get-title "${url}"`, { encoding: "utf-8", timeout: 30000 }).trim();
      }

      // Download audio as mp3
      const outFile = path.join(uploadsDir, `yt_${Date.now()}.mp3`);
      execSync(
        `yt-dlp -x --audio-format mp3 --audio-quality 5 -o "${outFile}" "${url}"`,
        { timeout: 120000 }
      );

      // The actual output file might have .mp3 appended by yt-dlp
      const actualFile = fs.existsSync(outFile) ? outFile : outFile + ".mp3";
      if (!fs.existsSync(actualFile)) {
        // Search for the file
        const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith(`yt_${outFile.split('yt_')[1]?.split('.')[0] || ''}`));
        if (files.length > 0) {
          res.json({ filePath: path.join(uploadsDir, files[0]), title: titleStr, artist: parsedArtist, track: parsedTrack });
          return;
        }
        return res.status(500).json({ error: "Download failed" });
      }

      res.json({ filePath: actualFile, title: titleStr, artist: parsedArtist, track: parsedTrack });
    } catch (err: any) {
      console.error("YouTube extract error:", err.message);
      res.status(500).json({ error: "Could not extract audio. Check the URL and try again." });
    }
  });

  // --- Lyrics Fetch (lrclib.net) ---
  app.get("/api/lyrics", async (req, res) => {
    const { q, artist, track } = req.query;
    if (!q && !track) return res.status(400).json({ error: "Provide q (search query) or track name" });

    try {
      let lyrics: string | null = null;
      let foundArtist = "";
      let foundTrack = "";

      // Try exact match first if we have artist + track
      if (artist && track) {
        const exactUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(String(artist))}&track_name=${encodeURIComponent(String(track))}`;
        const exactRes = await fetch(exactUrl, {
          headers: { "User-Agent": "VocalCoach/1.0" },
        });
        if (exactRes.ok) {
          const data = await exactRes.json();
          if (data.plainLyrics) {
            lyrics = data.plainLyrics;
            foundArtist = data.artistName || "";
            foundTrack = data.trackName || "";
          }
        }
      }

      // Fallback to search
      if (!lyrics) {
        const searchQuery = String(q || `${artist || ""} ${track || ""}`).trim();
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`;
        const searchRes = await fetch(searchUrl, {
          headers: { "User-Agent": "VocalCoach/1.0" },
        });
        if (searchRes.ok) {
          const results = await searchRes.json();
          if (Array.isArray(results) && results.length > 0) {
            // Pick the first result with plainLyrics
            const match = results.find((r: any) => r.plainLyrics) || results[0];
            lyrics = match.plainLyrics || null;
            foundArtist = match.artistName || "";
            foundTrack = match.trackName || "";
          }
        }
      }

      if (!lyrics) {
        return res.json({ lyrics: null, artist: foundArtist, track: foundTrack });
      }

      res.json({ lyrics, artist: foundArtist, track: foundTrack });
    } catch (err: any) {
      console.error("Lyrics fetch error:", err.message);
      res.json({ lyrics: null, artist: "", track: "" });
    }
  });

  // --- Serve uploaded audio files ---
  app.get("/api/audio/:filename", (req, res) => {
    const filePath = path.join(uploadsDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.sendFile(filePath);
  });

  // --- Lines ---
  app.get("/api/songs/:songId/lines", (req, res) => {
    const lines = storage.getLinesBySong(Number(req.params.songId));
    res.json(lines);
  });

  app.get("/api/lines/:id", (req, res) => {
    const line = storage.getLine(Number(req.params.id));
    if (!line) return res.status(404).json({ error: "Line not found" });
    res.json(line);
  });

  app.post("/api/songs/:songId/lines", (req, res) => {
    const line = storage.createLine({
      ...req.body,
      songId: Number(req.params.songId),
    });
    res.status(201).json(line);
  });

  app.delete("/api/lines/:id", (req, res) => {
    storage.deleteLine(Number(req.params.id));
    res.json({ ok: true });
  });

  // --- Recordings ---
  app.get("/api/lines/:lineId/recordings", (req, res) => {
    const recordings = storage.getRecordingsByLine(Number(req.params.lineId));
    // Don't send audio data in list view for performance
    const slim = recordings.map(({ audioData, ...rest }) => rest);
    res.json(slim);
  });

  app.get("/api/recordings/:id", (req, res) => {
    const recording = storage.getRecording(Number(req.params.id));
    if (!recording) return res.status(404).json({ error: "Recording not found" });
    res.json(recording);
  });

  app.post("/api/lines/:lineId/recordings", (req, res) => {
    const recording = storage.createRecording({
      ...req.body,
      lineId: Number(req.params.lineId),
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(recording);
  });

  app.get("/api/lines/:lineId/reference", (req, res) => {
    const ref = storage.getReferenceRecording(Number(req.params.lineId));
    if (!ref) return res.status(404).json({ error: "No reference recording" });
    res.json(ref);
  });

  // --- Metrics ---
  app.get("/api/recordings/:recordingId/metrics", (req, res) => {
    const m = storage.getMetricsByRecording(Number(req.params.recordingId));
    if (!m) return res.status(404).json({ error: "No metrics found" });
    res.json(m);
  });

  app.get("/api/lines/:lineId/metrics", (req, res) => {
    const m = storage.getMetricsByLine(Number(req.params.lineId));
    res.json(m);
  });

  app.post("/api/recordings/:recordingId/metrics", (req, res) => {
    const m = storage.createMetrics({
      ...req.body,
      recordingId: Number(req.params.recordingId),
    });
    res.status(201).json(m);
  });

  // --- Drills ---
  app.get("/api/lines/:lineId/drills", (req, res) => {
    const d = storage.getDrillsByLine(Number(req.params.lineId));
    res.json(d);
  });

  app.post("/api/drills", (req, res) => {
    const d = storage.createDrill({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(d);
  });

  app.patch("/api/drills/:id/complete", (req, res) => {
    storage.completeDrill(Number(req.params.id));
    res.json({ ok: true });
  });

  // --- Checkpoints ---
  app.get("/api/lines/:lineId/checkpoints", (req, res) => {
    const c = storage.getCheckpointsByLine(Number(req.params.lineId));
    res.json(c);
  });

  app.post("/api/checkpoints", (req, res) => {
    const c = storage.createCheckpoint({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(c);
  });

  // --- Daily Plan ---
  app.get("/api/daily-plan/:date", (req, res) => {
    const plan = storage.getDailyPlan(req.params.date);
    if (!plan) return res.status(404).json({ error: "No plan for this date" });
    res.json(plan);
  });

  app.post("/api/daily-plan", (req, res) => {
    const plan = storage.createDailyPlan(req.body);
    res.status(201).json(plan);
  });

  app.patch("/api/daily-plan/:id/complete", (req, res) => {
    storage.completeDailyPlan(Number(req.params.id));
    res.json({ ok: true });
  });

  // --- Coach Chat ---
  app.get("/api/chat/:lineId", (req, res) => {
    const messages = storage.getChatMessages(Number(req.params.lineId));
    res.json(messages);
  });

  app.post("/api/chat", async (req, res) => {
    const { lineId, message } = req.body;

    // Save user message
    storage.createChatMessage({
      lineId: lineId || null,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    });

    // Get context
    let lineText = "";
    let metricsContext = "";
    if (lineId) {
      const line = storage.getLine(lineId);
      lineText = line?.text || "";
      const lineMetrics = storage.getMetricsByLine(lineId);
      if (lineMetrics.length > 0) {
        const latest = lineMetrics[lineMetrics.length - 1];
        metricsContext = `Latest metrics: pitch deviation ${latest.avgPitchDeviation?.toFixed(1) || "N/A"} cents, ${latest.greenSegments} green segments, ${latest.redSegments} red segments, energy dropoff ${latest.energyDropoff?.toFixed(0) || "N/A"}%, overall score ${latest.overallScore?.toFixed(0) || "N/A"}/100.`;
      }
    }

    // Get recent chat history
    const history = storage.getChatMessages(lineId || null);
    const recentHistory = history.slice(-10);

    try {
      const client = new Anthropic();
      const systemPrompt = `You are a warm, encouraging vocal coach helping a beginner-to-intermediate singer improve. 
You speak in simple, everyday language — no heavy music theory terminology.
Instead of "diaphragmatic support," say "take a low breath and gently firm your belly/sides."
Instead of "30 cents flat," say "your note is a bit below the target here."
Be concise, empathetic, and always give 1-2 actionable tips.

Context:
- Line being practiced: "${lineText}"
- ${metricsContext || "No metrics data yet."}

When suggesting drills:
- For pitch issues: suggest looping specific words with a reference tone
- For energy drops: suggest shortening the line, then gradually extending
- For breath issues: suggest hiss + short phrase exercises`;

      const apiMessages = recentHistory.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      apiMessages.push({ role: "user", content: message });

      const response = await client.messages.create({
        model: "claude_sonnet_4_6",
        max_tokens: 512,
        system: systemPrompt,
        messages: apiMessages,
      });

      const assistantContent = response.content[0].type === "text" ? response.content[0].text : "";

      // Save assistant message
      const saved = storage.createChatMessage({
        lineId: lineId || null,
        role: "assistant",
        content: assistantContent,
        createdAt: new Date().toISOString(),
      });

      res.json(saved);
    } catch (error: any) {
      console.error("Chat error:", error);
      // Fallback response
      const fallback = storage.createChatMessage({
        lineId: lineId || null,
        role: "assistant",
        content: "I'm having trouble connecting right now. In the meantime, try recording yourself a few more times and focus on keeping your breath steady throughout the line. We'll review together when I'm back online.",
        createdAt: new Date().toISOString(),
      });
      res.json(fallback);
    }
  });

  // --- Progress summary ---
  app.get("/api/lines/:lineId/progress", (req, res) => {
    const lineId = Number(req.params.lineId);
    const allMetrics = storage.getMetricsByLine(lineId);
    const checkpointsList = storage.getCheckpointsByLine(lineId);

    if (allMetrics.length === 0) {
      return res.json({
        totalRecordings: 0,
        pitchTrend: [],
        energyTrend: [],
        scoreTrend: [],
        checkpoints: checkpointsList,
      });
    }

    const pitchTrend = allMetrics.map((m, i) => ({
      index: i + 1,
      value: m.avgPitchDeviation || 0,
    }));

    const energyTrend = allMetrics.map((m, i) => ({
      index: i + 1,
      value: 100 - (m.energyDropoff || 0),
    }));

    const scoreTrend = allMetrics.map((m, i) => ({
      index: i + 1,
      value: m.overallScore || 0,
    }));

    res.json({
      totalRecordings: allMetrics.length,
      pitchTrend,
      energyTrend,
      scoreTrend,
      checkpoints: checkpointsList,
    });
  });
}
