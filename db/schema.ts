import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const graphs = sqliteTable("graphs", {
  id: text("id").primaryKey(),
  room: text("room").notNull(),
  group: integer("group_number").notNull(),
  experiment: text("experiment", { enum: ["voltage", "resistance"] }).notNull(),
  imageKey: text("image_key").notNull(),
  mimeType: text("mime_type").notNull(),
  note: text("note").notNull().default(""),
  deleteTokenHash: text("delete_token_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("graphs_room_group_experiment_unique").on(table.room, table.group, table.experiment),
  index("graphs_room_index").on(table.room),
  check("graphs_group_valid", sql`${table.group} BETWEEN 1 AND 6`),
  check("graphs_experiment_valid", sql`${table.experiment} IN ('voltage', 'resistance')`),
  check("graphs_mime_valid", sql`${table.mimeType} IN ('image/jpeg', 'image/png', 'image/webp')`),
  check("graphs_note_length", sql`length(${table.note}) <= 500`),
]);
