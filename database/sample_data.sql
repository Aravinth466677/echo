-- Sample data for testing heatmap clustering
-- Insert sample complaints across Tamil Nadu

-- Sample complaints in Chennai area
INSERT INTO issues (category_id, location, status, echo_count, first_reported_at, last_reported_at) VALUES
(1, ST_GeogFromText('POINT(80.2707 13.0827)'), 'verified', 3, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
(2, ST_GeogFromText('POINT(80.2750 13.0850)'), 'pending', 1, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
(3, ST_GeogFromText('POINT(80.2800 13.0900)'), 'resolved', 2, NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days'),
(1, ST_GeogFromText('POINT(80.2650 13.0750)'), 'in_progress', 4, NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days');

-- Sample complaints in Coimbatore area
INSERT INTO issues (category_id, location, status, echo_count, first_reported_at, last_reported_at) VALUES
(4, ST_GeogFromText('POINT(76.9558 11.0168)'), 'verified', 2, NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'),
(5, ST_GeogFromText('POINT(76.9600 11.0200)'), 'pending', 1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
(2, ST_GeogFromText('POINT(76.9500 11.0100)'), 'resolved', 3, NOW() - INTERVAL '6 days', NOW() - INTERVAL '4 days');

-- Sample complaints in Madurai area
INSERT INTO issues (category_id, location, status, echo_count, first_reported_at, last_reported_at) VALUES
(6, ST_GeogFromText('POINT(78.1198 9.9252)'), 'verified', 1, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
(1, ST_GeogFromText('POINT(78.1250 9.9300)'), 'pending', 2, NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),
(3, ST_GeogFromText('POINT(78.1150 9.9200)'), 'in_progress', 1, NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days');

-- Insert corresponding complaints for each issue (using valid status values)
INSERT INTO complaints (issue_id, user_id, category_id, location, latitude, longitude, evidence_url, evidence_type, description, is_primary, status) VALUES
-- Chennai complaints
(1, 1, 1, ST_GeogFromText('POINT(80.2707 13.0827)'), 13.0827, 80.2707, '/uploads/pothole1.jpg', 'photo', 'Large pothole on main road', true, 'submitted'),
(1, 1, 1, ST_GeogFromText('POINT(80.2710 13.0830)'), 13.0830, 80.2710, '/uploads/pothole2.jpg', 'photo', 'Same pothole getting worse', false, 'submitted'),
(1, 1, 1, ST_GeogFromText('POINT(80.2705 13.0825)'), 13.0825, 80.2705, '/uploads/pothole3.jpg', 'photo', 'Pothole causing accidents', false, 'submitted'),

(2, 1, 2, ST_GeogFromText('POINT(80.2750 13.0850)'), 13.0850, 80.2750, '/uploads/light1.jpg', 'photo', 'Streetlight not working', true, 'submitted'),

(3, 1, 3, ST_GeogFromText('POINT(80.2800 13.0900)'), 13.0900, 80.2800, '/uploads/garbage1.jpg', 'photo', 'Garbage not collected', true, 'submitted'),
(3, 1, 3, ST_GeogFromText('POINT(80.2805 13.0905)'), 13.0905, 80.2805, '/uploads/garbage2.jpg', 'photo', 'Overflowing bins', false, 'submitted'),

(4, 1, 1, ST_GeogFromText('POINT(80.2650 13.0750)'), 13.0750, 80.2650, '/uploads/pothole4.jpg', 'photo', 'Multiple potholes', true, 'submitted'),
(4, 1, 1, ST_GeogFromText('POINT(80.2655 13.0755)'), 13.0755, 80.2655, '/uploads/pothole5.jpg', 'photo', 'Road damage', false, 'submitted'),
(4, 1, 1, ST_GeogFromText('POINT(80.2648 13.0748)'), 13.0748, 80.2648, '/uploads/pothole6.jpg', 'photo', 'Dangerous pothole', false, 'submitted'),
(4, 1, 1, ST_GeogFromText('POINT(80.2652 13.0752)'), 13.0752, 80.2652, '/uploads/pothole7.jpg', 'photo', 'Road needs repair', false, 'submitted'),

-- Coimbatore complaints
(5, 1, 4, ST_GeogFromText('POINT(76.9558 11.0168)'), 11.0168, 76.9558, '/uploads/water1.jpg', 'photo', 'Water leakage', true, 'submitted'),
(5, 1, 4, ST_GeogFromText('POINT(76.9560 11.0170)'), 11.0170, 76.9560, '/uploads/water2.jpg', 'photo', 'Pipe burst', false, 'submitted'),

(6, 1, 5, ST_GeogFromText('POINT(76.9600 11.0200)'), 11.0200, 76.9600, '/uploads/drain1.jpg', 'photo', 'Blocked drain', true, 'submitted'),

(7, 1, 2, ST_GeogFromText('POINT(76.9500 11.0100)'), 11.0100, 76.9500, '/uploads/light2.jpg', 'photo', 'Street lights off', true, 'submitted'),
(7, 1, 2, ST_GeogFromText('POINT(76.9505 11.0105)'), 11.0105, 76.9505, '/uploads/light3.jpg', 'photo', 'Dark street', false, 'submitted'),
(7, 1, 2, ST_GeogFromText('POINT(76.9495 11.0095)'), 11.0095, 76.9495, '/uploads/light4.jpg', 'photo', 'Broken light pole', false, 'submitted'),

-- Madurai complaints
(8, 1, 6, ST_GeogFromText('POINT(78.1198 9.9252)'), 9.9252, 78.1198, '/uploads/encroach1.jpg', 'photo', 'Illegal construction', true, 'submitted'),

(9, 1, 1, ST_GeogFromText('POINT(78.1250 9.9300)'), 9.9300, 78.1250, '/uploads/pothole8.jpg', 'photo', 'Road damage', true, 'submitted'),
(9, 1, 1, ST_GeogFromText('POINT(78.1252 9.9302)'), 9.9302, 78.1252, '/uploads/pothole9.jpg', 'photo', 'Pothole cluster', false, 'submitted'),

(10, 1, 3, ST_GeogFromText('POINT(78.1150 9.9200)'), 9.9200, 78.1150, '/uploads/garbage3.jpg', 'photo', 'Waste dumping', true, 'submitted');