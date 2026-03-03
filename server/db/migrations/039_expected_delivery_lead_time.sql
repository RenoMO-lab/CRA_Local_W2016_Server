INSERT INTO admin_list_items (id, category, value, sort_order) VALUES
  ('expectedDeliveryOptions-6', 'expectedDeliveryOptions', 'Lead Time', 6)
ON CONFLICT (id) DO NOTHING;
