MERGE dbo.admin_list_items AS target
USING (VALUES
  ('expectedDeliveryOptions-4', 'expectedDeliveryOptions', 'Recommend Appropriate Solution', 4)
) AS source (id, category, value, sort_order)
ON target.id = source.id
WHEN NOT MATCHED THEN
  INSERT (id, category, value, sort_order)
  VALUES (source.id, source.category, source.value, source.sort_order);
