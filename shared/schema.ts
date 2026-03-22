import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Songs table — a user's uploaded/selected song
export const songs = sqliteTable("songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  artist: text("artist"),
  sourceType: text("source_type").notNull(), // "upload" | "youtube" | "recorded"
  sourceUrl: text("source_url"), // YouTube URL or file path
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
});

// Lines table — specific sections/hooks of a song to practice
export const lines = sqliteTable("lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  songId: integer("song_id").notNull(),
  text: text("text").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  startTime: real("start_time"), // seconds into song audio where this line starts
  endTime: real("end_time"),     // seconds into song audio where this line ends
  targetPitchData: text("target_pitch_data"), // JSON array of {time, freq, midi, note} from original audio
});

// Recordings table — individual vocal takes
export const recordings = sqliteTable("recordings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lineId: integer("line_id").notNull(),
  isReference: integer("is_reference", { mode: "boolean" }).default(false),
  isBaseline: integer("is_baseline", { mode: "boolean" }).default(false),
  isCheckpoint: integer("is_checkpoint", { mode: "boolean" }).default(false),
  audioData: text("audio_data"), // base64 encoded
  duration: real("duration"), // seconds
  createdAt: text("created_at").notNull(),
});

// Metrics table — analysis results per recording
export const metrics = sqliteTable("metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recordingId: integer("recording_id").notNull(),
  pitchData: text("pitch_data"), // JSON array of {time, freq, target, deviation}
  loudnessData: text("loudness_data"), // JSON array of {time, db}
  avgPitchDeviation: real("avg_pitch_deviation"),
  greenSegments: integer("green_segments").default(0),
  redSegments: integer("red_segments").default(0),
  energyDropoff: real("energy_dropoff"), // % drop in last third
  breathCutoffs: integer("breath_cutoffs").default(0),
  overallScore: real("overall_score"), // 0-100
});

// Drills table — suggested exercises
export const drills = sqliteTable("drills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recordingId: integer("recording_id"),
  lineId: integer("line_id"),
  type: text("type").notNull(), // "pitch_loop" | "energy_sustain" | "breath_control" | "warmup"
  title: text("title").notNull(),
  description: text("description").notNull(),
  targetWords: text("target_words"), // specific words to focus on
  completed: integer("completed", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

// Progress checkpoints — bi-weekly snapshots
export const checkpoints = sqliteTable("checkpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lineId: integer("line_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  avgPitchAccuracy: real("avg_pitch_accuracy"), // 0-100
  avgEnergyStability: real("avg_energy_stability"), // 0-100
  avgOverallScore: real("avg_overall_score"),
  summary: text("summary"), // AI-generated summary
  createdAt: text("created_at").notNull(),
});

// Coach chat messages
export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lineId: integer("line_id"),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

// Daily practice plans
export const dailyPlans = sqliteTable("daily_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  steps: text("steps").notNull(), // JSON array of plan steps
  completed: integer("completed", { mode: "boolean" }).default(false),
});

// Insert schemas
export const insertSongSchema = createInsertSchema(songs).omit({ id: true });
export const insertLineSchema = createInsertSchema(lines).omit({ id: true });
export const insertRecordingSchema = createInsertSchema(recordings).omit({ id: true });
export const insertMetricsSchema = createInsertSchema(metrics).omit({ id: true });
export const insertDrillSchema = createInsertSchema(drills).omit({ id: true });
export const insertCheckpointSchema = createInsertSchema(checkpoints).omit({ id: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true });
export const insertDailyPlanSchema = createInsertSchema(dailyPlans).omit({ id: true });

// Types
export type Song = typeof songs.$inferSelect;
export type InsertSong = z.infer<typeof insertSongSchema>;
export type Line = typeof lines.$inferSelect;
export type InsertLine = z.infer<typeof insertLineSchema>;
export type Recording = typeof recordings.$inferSelect;
export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Metrics = typeof metrics.$inferSelect;
export type InsertMetrics = z.infer<typeof insertMetricsSchema>;
export type Drill = typeof drills.$inferSelect;
export type InsertDrill = z.infer<typeof insertDrillSchema>;
export type Checkpoint = typeof checkpoints.$inferSelect;
export type InsertCheckpoint = z.infer<typeof insertCheckpointSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type InsertDailyPlan = z.infer<typeof insertDailyPlanSchema>;
