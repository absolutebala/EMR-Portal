-- Add optional custom title to form_tables
alter table form_tables add column if not exists title text default null;
