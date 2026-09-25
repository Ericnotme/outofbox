CREATE TABLE `knight_live_players` (
	`owner` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`side` text NOT NULL,
	`name` text NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_live_players_seat` ON `knight_live_players` (`room_id`,`side`);--> statement-breakpoint
CREATE TABLE `knight_live_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`white_owner` text NOT NULL,
	`black_owner` text,
	`white_name` text NOT NULL,
	`black_name` text,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`turn_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_live_rooms_queue` ON `knight_live_rooms` (`status`,`visibility`,`created_at`);