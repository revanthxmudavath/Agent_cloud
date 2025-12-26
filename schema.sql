-- User preferences and profile
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  timezone TEXT DEFAULT 'UTC',
  preferences TEXT, -- JSON blob for user preferences
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Tasks and reminders
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date INTEGER, -- Unix timestamp
  completed INTEGER DEFAULT 0, -- Boolean: 0 or 1
  priority TEXT DEFAULT 'medium', -- low, medium, high
  created_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversation history for long-term memory
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant' or 'system'
  content TEXT NOT NULL,
  timestamp INTEGER DEFAULT (unixepoch()),
  metadata TEXT, -- JSON blob for additional context
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Knowledge base entries for RAG
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  vector_id TEXT, -- Reference to Vectorize index
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
CREATE INDEX IF NOT EXISTS idx_knowledge_user_id ON knowledge_entries(user_id);

-- Composite indexes for optimized queries
CREATE INDEX IF NOT EXISTS idx_tasks_id_user_id ON tasks(id, user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_due ON tasks(user_id, completed, due_date);
