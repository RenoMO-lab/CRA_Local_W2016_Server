MERGE dbo.admin_list_items AS target
USING (VALUES
  ('repeatabilityTypes-1', 'repeatabilityTypes', 'Recurrent Order', 1),
  ('repeatabilityTypes-2', 'repeatabilityTypes', 'One Shot Order', 2)
) AS source (id, category, value, sort_order)
ON target.id = source.id
WHEN NOT MATCHED THEN
  INSERT (id, category, value, sort_order)
  VALUES (source.id, source.category, source.value, source.sort_order);
