DELETE FROM admin_list_items WHERE category = 'repeatabilityTypes';

INSERT INTO admin_list_items (id, category, value, sort_order) VALUES
  ('repeatabilityTypes-1', 'repeatabilityTypes', 'One-off Prototype', 1),
  ('repeatabilityTypes-2', 'repeatabilityTypes', 'Small batch', 2),
  ('repeatabilityTypes-3', 'repeatabilityTypes', 'Regular series', 3),
  ('repeatabilityTypes-4', 'repeatabilityTypes', 'Long Term Program', 4)
ON CONFLICT (id) DO NOTHING;
