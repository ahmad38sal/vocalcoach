import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and } from "drizzle-orm";
import fs from "fs";
import {
  songs, lines, recordings, metrics, drills, checkpoints, chatMessages, dailyPlans,
  type Song, type InsertSong,
  type Line, type InsertLine,
  type Recording, type InsertRecording,
  type Metrics, type InsertMetrics,
  type Drill, type InsertDrill,
  type Checkpoint, type InsertCheckpoint,
  type ChatMessage, type InsertChatMessage,
  type DailyPlan, type InsertDailyPlan,
} from "@shared/schema";

const dataDir = process.env.DATA_DIR || ".";
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = `${dataDir}/vocalcoach.db`;
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

// Auto-create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT,
    source_type TEXT NOT NULL,
    source_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    start_time REAL,
    end_time REAL,
    target_pitch_data TEXT
  );
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id INTEGER NOT NULL,
    is_reference INTEGER DEFAULT 0,
    is_baseline INTEGER DEFAULT 0,
    is_checkpoint INTEGER DEFAULT 0,
    audio_data TEXT,
    duration REAL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id INTEGER NOT NULL,
    pitch_data TEXT,
    loudness_data TEXT,
    avg_pitch_deviation REAL,
    green_segments INTEGER DEFAULT 0,
    red_segments INTEGER DEFAULT 0,
    energy_dropoff REAL,
    breath_cutoffs INTEGER DEFAULT 0,
    overall_score REAL
  );
  CREATE TABLE IF NOT EXISTS drills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id INTEGER,
    line_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_words TEXT,
    completed INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id INTEGER NOT NULL,
    week_number INTEGER NOT NULL,
    avg_pitch_accuracy REAL,
    avg_energy_stability REAL,
    avg_overall_score REAL,
    summary TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id INTEGER,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    steps TEXT NOT NULL,
    completed INTEGER DEFAULT 0
  );
`);

// Migrate existing tables — add columns if missing
try {
  sqlite.exec(`ALTER TABLE lines ADD COLUMN start_time REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE lines ADD COLUMN end_time REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE lines ADD COLUMN target_pitch_data TEXT`);
} catch { /* column already exists */ }

export interface IStorage {
  // Songs
  getSongs(): Song[];
  getSong(id: number): Song | undefined;
  createSong(data: InsertSong): Song;
  updateSong(id: number, data: Partial<InsertSong>): Song | undefined;
  deleteSong(id: number): void;

  // Lines
  getLinesBySong(songId: number): Line[];
  getLine(id: number): Line | undefined;
  createLine(data: InsertLine): Line;
  updateLine(id: number, data: Partial<InsertLine>): Line | undefined;
  deleteLine(id: number): void;

  // Recordings
  getRecordingsByLine(lineId: number): Recording[];
  getRecording(id: number): Recording | undefined;
  createRecording(data: InsertRecording): Recording;
  getReferenceRecording(lineId: number): Recording | undefined;
  getBaselineRecording(lineId: number): Recording | undefined;

  // Metrics
  getMetricsByRecording(recordingId: number): Metrics | undefined;
  getMetricsByLine(lineId: number): Metrics[];
  createMetrics(data: InsertMetrics): Metrics;

  // Drills
  getDrillsByLine(lineId: number): Drill[];
  getDrillsByRecording(recordingId: number): Drill[];
  createDrill(data: InsertDrill): Drill;
  completeDrill(id: number): void;

  // Checkpoints
  getCheckpointsByLine(lineId: number): Checkpoint[];
  createCheckpoint(data: InsertCheckpoint): Checkpoint;

  // Chat
  getChatMessages(lineId: number | null): ChatMessage[];
  createChatMessage(data: InsertChatMessage): ChatMessage;

  // Daily Plans
  getDailyPlan(date: string): DailyPlan | undefined;
  createDailyPlan(data: InsertDailyPlan): DailyPlan;
  completeDailyPlan(id: number): void;
}

export class DatabaseStorage implements IStorage {
  getSongs(): Song[] {
    return db.select().from(songs).all();
  }

  getSong(id: number): Song | undefined {
    return db.select().from(songs).where(eq(songs.id, id)).get();
  }

  createSong(data: InsertSong): Song {
    return db.insert(songs).values(data).returning().get();
  }

  updateSong(id: number, data: Partial<InsertSong>): Song | undefined {
    return db.update(songs).set(data).where(eq(songs.id, id)).returning().get();
  }

  deleteSong(id: number): void {
    db.delete(songs).where(eq(songs.id, id)).run();
  }

  getLinesBySong(songId: number): Line[] {
    return db.select().from(lines).where(eq(lines.songId, songId)).all();
  }

  getLine(id: number): Line | undefined {
    return db.select().from(lines).where(eq(lines.id, id)).get();
  }

  createLine(data: InsertLine): Line {
    return db.insert(lines).values(data).returning().get();
  }

  updateLine(id: number, data: Partial<InsertLine>): Line | undefined {
    return db.update(lines).set(data).where(eq(lines.id, id)).returning().get();
  }

  deleteLine(id: number): void {
    db.delete(lines).where(eq(lines.id, id)).run();
  }

  getRecordingsByLine(lineId: number): Recording[] {
    return db.select().from(recordings).where(eq(recordings.lineId, lineId)).all();
  }

  getRecording(id: number): Recording | undefined {
    return db.select().from(recordings).where(eq(recordings.id, id)).get();
  }

  createRecording(data: InsertRecording): Recording {
    return db.insert(recordings).values(data).returning().get();
  }

  getReferenceRecording(lineId: number): Recording | undefined {
    return db.select().from(recordings)
      .where(and(eq(recordings.lineId, lineId), eq(recordings.isReference, true)))
      .get();
  }

  getBaselineRecording(lineId: number): Recording | undefined {
    return db.select().from(recordings)
      .where(and(eq(recordings.lineId, lineId), eq(recordings.isBaseline, true)))
      .get();
  }

  getMetricsByRecording(recordingId: number): Metrics | undefined {
    return db.select().from(metrics).where(eq(metrics.recordingId, recordingId)).get();
  }

  getMetricsByLine(lineId: number): Metrics[] {
    const recs = db.select().from(recordings).where(eq(recordings.lineId, lineId)).all();
    const recIds = recs.map(r => r.id);
    if (recIds.length === 0) return [];
    const allMetrics: Metrics[] = [];
    for (const recId of recIds) {
      const m = db.select().from(metrics).where(eq(metrics.recordingId, recId)).get();
      if (m) allMetrics.push(m);
    }
    return allMetrics;
  }

  createMetrics(data: InsertMetrics): Metrics {
    return db.insert(metrics).values(data).returning().get();
  }

  getDrillsByLine(lineId: number): Drill[] {
    return db.select().from(drills).where(eq(drills.lineId, lineId)).all();
  }

  getDrillsByRecording(recordingId: number): Drill[] {
    return db.select().from(drills).where(eq(drills.recordingId, recordingId)).all();
  }

  createDrill(data: InsertDrill): Drill {
    return db.insert(drills).values(data).returning().get();
  }

  completeDrill(id: number): void {
    db.update(drills).set({ completed: true }).where(eq(drills.id, id)).run();
  }

  getCheckpointsByLine(lineId: number): Checkpoint[] {
    return db.select().from(checkpoints).where(eq(checkpoints.lineId, lineId)).all();
  }

  createCheckpoint(data: InsertCheckpoint): Checkpoint {
    return db.insert(checkpoints).values(data).returning().get();
  }

  getChatMessages(lineId: number | null): ChatMessage[] {
    if (lineId) {
      return db.select().from(chatMessages).where(eq(chatMessages.lineId, lineId)).all();
    }
    return db.select().from(chatMessages).all();
  }

  createChatMessage(data: InsertChatMessage): ChatMessage {
    return db.insert(chatMessages).values(data).returning().get();
  }

  getDailyPlan(date: string): DailyPlan | undefined {
    return db.select().from(dailyPlans).where(eq(dailyPlans.date, date)).get();
  }

  createDailyPlan(data: InsertDailyPlan): DailyPlan {
    return db.insert(dailyPlans).values(data).returning().get();
  }

  completeDailyPlan(id: number): void {
    db.update(dailyPlans).set({ completed: true }).where(eq(dailyPlans.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
