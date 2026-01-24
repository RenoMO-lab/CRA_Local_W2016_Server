MERGE dbo.admin_list_items AS target
USING (VALUES
  ('expectedDeliveryOptions-1', 'expectedDeliveryOptions', 'Exploded 3D', 1),
  ('expectedDeliveryOptions-2', 'expectedDeliveryOptions', '2D sales drawing', 2),
  ('expectedDeliveryOptions-3', 'expectedDeliveryOptions', 'Feasibility confirmation', 3)
) AS source (id, category, value, sort_order)
ON target.id = source.id
WHEN NOT MATCHED THEN
  INSERT (id, category, value, sort_order)
  VALUES (source.id, source.category, source.value, source.sort_order);
