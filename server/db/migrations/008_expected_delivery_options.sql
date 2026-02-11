INSERT INTO admin_list_items (id, category, value, sort_order) VALUES
  ('expectedDeliveryOptions-1', 'expectedDeliveryOptions', 'Exploded 3D', 1),
  ('expectedDeliveryOptions-2', 'expectedDeliveryOptions', '2D sales drawing', 2),
  ('expectedDeliveryOptions-3', 'expectedDeliveryOptions', 'Feasibility confirmation', 3)
ON CONFLICT (id) DO NOTHING;
