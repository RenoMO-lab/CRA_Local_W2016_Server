INSERT INTO admin_list_items (id, category, value, sort_order) VALUES
  ('expectedDeliveryOptions-4', 'expectedDeliveryOptions', 'Recommend Appropriate Solution', 4)
ON CONFLICT (id) DO NOTHING;
