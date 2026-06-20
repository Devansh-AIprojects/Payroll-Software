-- Migration 014: Add jobber_type and room_no to employees

ALTER TABLE employees 
ADD COLUMN jobber_type VARCHAR(50) DEFAULT 'none' CHECK (jobber_type IN ('none', 'lc', 'pp', 'rf')),
ADD COLUMN room_no VARCHAR(50);
