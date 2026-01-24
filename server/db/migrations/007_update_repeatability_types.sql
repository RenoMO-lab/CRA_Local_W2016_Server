DELETE FROM dbo.admin_list_items WHERE category = 'repeatabilityTypes';

MERGE dbo.admin_list_items AS target
USING (VALUES
  ('repeatabilityTypes-1', 'repeatabilityTypes', 'One-off Prototype', 1),
  ('repeatabilityTypes-2', 'repeatabilityTypes', 'Small batch', 2),
  ('repeatabilityTypes-3', 'repeatabilityTypes', 'Regular series', 3),
  ('repeatabilityTypes-4', 'repeatabilityTypes', 'Long Term Program', 4)
) AS source (id, category, value, sort_order)
ON target.id = source.id
WHEN NOT MATCHED THEN
  INSERT (id, category, value, sort_order)
  VALUES (source.id, source.category, source.value, source.sort_order);
