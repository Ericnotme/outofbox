import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
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
