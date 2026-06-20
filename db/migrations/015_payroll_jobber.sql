-- Migration 015: Add jobber_allowance to payroll_records

ALTER TABLE payroll_records
ADD COLUMN jobber_allowance NUMERIC(10,2) NOT NULL DEFAULT 0;
