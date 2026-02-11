UPDATE admin_list_items AS target
SET value = 'As Per ROC Standard'
WHERE target.value = 'As per ROC Standard'
  AND NOT EXISTS (
    SELECT 1
    FROM admin_list_items AS other
    WHERE other.category = target.category
      AND other.value = 'As Per ROC Standard'
  );
