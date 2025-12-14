-- Migration 0002: Foreign Key Enforcement and Performance Indexes
-- Date: 2025-12-11
-- Purpose: Enable foreign key constraints and add composite indexes for better performance

-- Enable foreign key constraints (must be set per connection)
PRAGMA foreign_keys = ON;

-- Add composite index for task lookups (id + user_id)
-- This optimizes the common pattern: SELECT * FROM tasks WHERE id = ? AND user_id = ?
CREATE INDEX IF NOT EXISTS idx_tasks_id_user_id ON tasks(id, user_id);

-- Add composite index for task filtering (user_id + completed + due_date)
-- This optimizes: SELECT * FROM tasks WHERE user_id = ? AND completed = ? ORDER BY due_date
CREATE INDEX IF NOT EXISTS idx_tasks_user_completed_due ON tasks(user_id, completed, due_date);

-- Analyze and optimize the database
PRAGMA optimize;
