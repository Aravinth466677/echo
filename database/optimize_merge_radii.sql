-- Update category-specific merge radii for better duplicate detection
-- Based on real-world analysis of complaint types

UPDATE categories SET aggregation_radius_meters = 25 WHERE name = 'Pothole';
-- Potholes are very location-specific, 25m is appropriate

UPDATE categories SET aggregation_radius_meters = 15 WHERE name = 'Streetlight'; 
-- Streetlights are specific fixtures, 15m radius

UPDATE categories SET aggregation_radius_meters = 50 WHERE name = 'Garbage';
-- Garbage issues can affect a wider area

UPDATE categories SET aggregation_radius_meters = 30 WHERE name = 'Water Supply';
-- Water supply issues are pipe/connection specific

UPDATE categories SET aggregation_radius_meters = 40 WHERE name = 'Drainage';
-- Drainage issues can affect nearby areas

UPDATE categories SET aggregation_radius_meters = 20 WHERE name = 'Encroachment';
-- Encroachment is property-specific

-- Add a comment column to track reasoning
ALTER TABLE categories ADD COLUMN IF NOT EXISTS radius_reasoning TEXT;

UPDATE categories SET radius_reasoning = 'Road damage is location-specific, 25m covers same road section' WHERE name = 'Pothole';
UPDATE categories SET radius_reasoning = 'Streetlight fixtures are specific, 15m covers same pole/area' WHERE name = 'Streetlight';
UPDATE categories SET radius_reasoning = 'Garbage issues can spread, 50m covers same collection area' WHERE name = 'Garbage';
UPDATE categories SET radius_reasoning = 'Water supply issues are pipe-specific, 30m covers same connection' WHERE name = 'Water Supply';
UPDATE categories SET radius_reasoning = 'Drainage affects nearby areas, 40m covers same drainage system' WHERE name = 'Drainage';
UPDATE categories SET radius_reasoning = 'Encroachment is property-specific, 20m covers same property/boundary' WHERE name = 'Encroachment';

-- View updated settings
SELECT name, aggregation_radius_meters, radius_reasoning FROM categories ORDER BY name;