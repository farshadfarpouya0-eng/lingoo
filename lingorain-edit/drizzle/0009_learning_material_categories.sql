ALTER TABLE learning_materials ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS materials_category_published_idx ON learning_materials (category, published);
