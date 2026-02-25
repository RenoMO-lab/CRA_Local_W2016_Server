CREATE TABLE IF NOT EXISTS admin_list_items (
  id text PRIMARY KEY,
  category text NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_admin_list_items_category
  ON admin_list_items (category, sort_order);

INSERT INTO admin_list_items (id, category, value, sort_order) VALUES
  ('applicationVehicles-1', 'applicationVehicles', 'Agricultural Trailer', 1),
  ('applicationVehicles-2', 'applicationVehicles', 'Construction Equipment Trailer', 2),
  ('applicationVehicles-3', 'applicationVehicles', 'Forestry Trailer', 3),
  ('applicationVehicles-4', 'applicationVehicles', 'GSE', 4),
  ('applicationVehicles-5', 'applicationVehicles', 'Baler', 5),
  ('countries-1', 'countries', 'China', 1),
  ('countries-2', 'countries', 'France', 2),
  ('countries-3', 'countries', 'India', 3),
  ('countries-4', 'countries', 'Vietnam', 4),
  ('countries-5', 'countries', 'Australia', 5),
  ('countries-6', 'countries', 'New-Zealand', 6),
  ('countries-7', 'countries', 'Canada', 7),
  ('countries-8', 'countries', 'Argentina', 8),
  ('countries-9', 'countries', 'Brazil', 9),
  ('countries-10', 'countries', 'Chili', 10),
  ('countries-11', 'countries', 'Spain', 11),
  ('brakeTypes-1', 'brakeTypes', 'Drum', 1),
  ('brakeTypes-2', 'brakeTypes', 'Disk', 2),
  ('brakeTypes-3', 'brakeTypes', 'N/A', 3),
  ('brakeSizes-1', 'brakeSizes', '180x32', 1),
  ('brakeSizes-2', 'brakeSizes', '250x50', 2),
  ('brakeSizes-3', 'brakeSizes', '300x60', 3),
  ('brakeSizes-4', 'brakeSizes', '400x80', 4),
  ('brakeSizes-5', 'brakeSizes', 'N/A', 5),
  ('suspensions-1', 'suspensions', 'Air suspension', 1),
  ('suspensions-2', 'suspensions', 'Leaf spring', 2),
  ('suspensions-3', 'suspensions', 'Hydraulic', 3),
  ('suspensions-4', 'suspensions', 'PS-ROC', 4),
  ('suspensions-5', 'suspensions', 'V-ROC', 5),
  ('suspensions-6', 'suspensions', 'N/A', 6),
  ('axleLocations-1', 'axleLocations', 'Front', 1),
  ('axleLocations-2', 'axleLocations', 'Rear', 2),
  ('axleLocations-3', 'axleLocations', 'N/A', 3),
  ('articulationTypes-1', 'articulationTypes', 'Straight axle', 1),
  ('articulationTypes-2', 'articulationTypes', 'Steering axle', 2),
  ('articulationTypes-3', 'articulationTypes', 'N/A', 3),
  ('configurationTypes-1', 'configurationTypes', 'Tandem', 1),
  ('configurationTypes-2', 'configurationTypes', 'Tridem', 2),
  ('configurationTypes-3', 'configurationTypes', 'Boggie', 3),
  ('configurationTypes-4', 'configurationTypes', 'Industrial Axles', 4),
  ('configurationTypes-5', 'configurationTypes', 'Stub Axles', 5),
  ('configurationTypes-6', 'configurationTypes', 'Single Axles', 6)
ON CONFLICT (id) DO NOTHING;
