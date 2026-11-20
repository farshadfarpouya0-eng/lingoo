-- Independent 25-minute lesson price per tutor (null = auto-price at 55% of the 50-minute price).
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS price_25 integer;
