MERGE dbo.admin_list_items AS target
USING (VALUES
  ('workingConditions-1', 'workingConditions', 'Dry', 1),
  ('workingConditions-2', 'workingConditions', 'Wet', 2),
  ('workingConditions-3', 'workingConditions', 'Under Water', 3),
  ('usageTypes-1', 'usageTypes', '100% Off-Road', 1),
  ('usageTypes-2', 'usageTypes', 'On-Road', 2),
  ('usageTypes-3', 'usageTypes', 'Hybrid', 3),
  ('environments-1', 'environments', 'Clean', 1),
  ('environments-2', 'environments', 'Dusty', 2)
) AS source (id, category, value, sort_order)
ON target.id = source.id
WHEN NOT MATCHED THEN
  INSERT (id, category, value, sort_order)
  VALUES (source.id, source.category, source.value, source.sort_order);
