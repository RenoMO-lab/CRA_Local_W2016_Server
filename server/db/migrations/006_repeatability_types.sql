INSERT INTO admin_list_items (id, category, value, sort_order) VALUES
  ('repeatabilityTypes-1', 'repeatabilityTypes', 'Recurrent Order', 1),
  ('repeatabilityTypes-2', 'repeatabilityTypes', 'One Shot Order', 2)
ON CONFLICT (id) DO NOTHING;
