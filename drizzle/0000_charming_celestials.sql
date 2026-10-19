CREATE TABLE `graphs` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`group_number` integer NOT NULL,
	`experiment` text NOT NULL,
	`image_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`delete_token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "graphs_group_valid" CHECK("graphs"."group_number" BETWEEN 1 AND 6),
	CONSTRAINT "graphs_experiment_valid" CHECK("graphs"."experiment" IN ('voltage', 'resistance')),
	CONSTRAINT "graphs_mime_valid" CHECK("graphs"."mime_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "graphs_note_length" CHECK(length("graphs"."note") <= 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `graphs_room_group_experiment_unique` ON `graphs` (`room`,`group_number`,`experiment`);--> statement-breakpoint
CREATE INDEX `graphs_room_index` ON `graphs` (`room`);