INSERT INTO admin_list_items (id, category, value, sort_order) VALUES
  ('expectedDeliveryOptions-5', 'expectedDeliveryOptions', 'Price Quote', 5)
ON CONFLICT (id) DO NOTHING;
