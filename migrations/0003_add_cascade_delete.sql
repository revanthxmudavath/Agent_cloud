-- Migration 0003: Add CASCADE DELETE to Foreign Keys
-- Date: 2025-12-11
-- Purpose: Automatically delete child records when parent user is deleted
-- Note: SQLite doesn't support ALTER TABLE for foreign key changes, so we use table recreation

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ==================== TASKS TABLE ====================

-- 1. Create backup of tasks table
CREATE TABLE IF NOT EXISTS tasks_backup (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date INTEGER,
  completed INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 2. Copy data to backup
INSERT INTO tasks_backup SELECT * FROM tasks;

-- 3. Drop old tasks table
DROP TABLE tasks;

-- 4. Recreate tasks table with CASCADE DELETE
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date INTEGER,
  completed INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Restore data from backup
INSERT INTO tasks SELECT * FROM tasks_backup;

-- 6. Drop backup table
DROP TABLE tasks_backup;

-- 7. Recreate indexes for tasks table
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_id_user_id ON tasks(id, user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_due ON tasks(user_id, completed, due_date);

-- ==================== CONVERSATIONS TABLE ====================

-- 1. Create backup of conversations table
CREATE TABLE IF NOT EXISTS conversations_backup (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER DEFAULT (unixepoch()),
  metadata TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 2. Copy data to backup
INSERT INTO conversations_backup SELECT * FROM conversations;

-- 3. Drop old conversations table
DROP TABLE conversations;

-- 4. Recreate conversations table with CASCADE DELETE
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER DEFAULT (unixepoch()),
  metadata TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Restore data from backup
INSERT INTO conversations SELECT * FROM conversations_backup;

-- 6. Drop backup table
DROP TABLE conversations_backup;

-- 7. Recreate indexes for conversations table
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);

-- ==================== KNOWLEDGE_ENTRIES TABLE ====================

-- 1. Create backup of knowledge_entries table
CREATE TABLE IF NOT EXISTS knowledge_entries_backup (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  vector_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 2. Copy data to backup
INSERT INTO knowledge_entries_backup SELECT * FROM knowledge_entries;

-- 3. Drop old knowledge_entries table
DROP TABLE knowledge_entries;

-- 4. Recreate knowledge_entries table with CASCADE DELETE
CREATE TABLE knowledge_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  vector_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Restore data from backup
INSERT INTO knowledge_entries SELECT * FROM knowledge_entries_backup;

-- 6. Drop backup table
DROP TABLE knowledge_entries_backup;

-- 7. Recreate indexes for knowledge_entries table
CREATE INDEX IF NOT EXISTS idx_knowledge_user_id ON knowledge_entries(user_id);

-- ==================== FINALIZE ====================

-- Analyze and optimize the database
PRAGMA optimize;
