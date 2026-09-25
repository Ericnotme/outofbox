import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const liveRooms=sqliteTable('knight_live_rooms',{
  id:text('id').primaryKey(),
  visibility:text('visibility').notNull(),
  status:text('status').notNull().default('waiting'),
  whiteOwner:text('white_owner').notNull(),
  blackOwner:text('black_owner'),
  whiteName:text('white_name').notNull(),
  blackName:text('black_name'),
  state:text('state').notNull(),
  revision:integer('revision').notNull().default(0),
  createdAt:integer('created_at').notNull(),
  updatedAt:integer('updated_at').notNull(),
  turnAt:integer('turn_at').notNull()
},t=>[index('idx_live_rooms_queue').on(t.status,t.visibility,t.createdAt)]);
export const livePlayers=sqliteTable('knight_live_players',{
  owner:text('owner').primaryKey(),
  roomId:text('room_id').notNull(),
  side:text('side').notNull(),
  name:text('name').notNull(),
  seenAt:integer('seen_at').notNull()
},t=>[uniqueIndex('idx_live_players_seat').on(t.roomId,t.side)]);
export const jams=sqliteTable('knight_jams',{
  owner:text('owner').primaryKey(),
  data:text('data').notNull(),
  revision:integer('revision').notNull().default(0),
  updatedAt:integer('updated_at').notNull()
});
export const notebooks=sqliteTable('knight_notebooks',{
  owner:text('owner').primaryKey(),
  data:text('data').notNull(),
  revision:integer('revision').notNull().default(0),
  updatedAt:integer('updated_at').notNull()
});
export const sessions=sqliteTable('knight_sessions',{
  owner:text('owner').primaryKey(),
  data:text('data').notNull(),
  revision:integer('revision').notNull().default(0),
  updatedAt:integer('updated_at').notNull()
});
