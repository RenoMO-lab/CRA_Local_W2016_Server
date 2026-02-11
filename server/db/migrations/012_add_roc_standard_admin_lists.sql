INSERT INTO admin_list_items (id, category, value, sort_order)
SELECT
  'brakeTypes-roc-standard',
  'brakeTypes',
  'As Per ROC Standard',
  COALESCE((SELECT MAX(sort_order) FROM admin_list_items WHERE category = 'brakeTypes'), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_list_items WHERE category = 'brakeTypes' AND value = 'As Per ROC Standard'
);

INSERT INTO admin_list_items (id, category, value, sort_order)
SELECT
  'mainBodySectionTypes-roc-standard',
  'mainBodySectionTypes',
  'As Per ROC Standard',
  COALESCE((SELECT MAX(sort_order) FROM admin_list_items WHERE category = 'mainBodySectionTypes'), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_list_items WHERE category = 'mainBodySectionTypes' AND value = 'As Per ROC Standard'
);

INSERT INTO admin_list_items (id, category, value, sort_order)
SELECT
  'clientSealingRequests-roc-standard',
  'clientSealingRequests',
  'As Per ROC Standard',
  COALESCE((SELECT MAX(sort_order) FROM admin_list_items WHERE category = 'clientSealingRequests'), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_list_items WHERE category = 'clientSealingRequests' AND value = 'As Per ROC Standard'
);

INSERT INTO admin_list_items (id, category, value, sort_order)
SELECT
  'cupLogoOptions-roc-standard',
  'cupLogoOptions',
  'As Per ROC Standard',
  COALESCE((SELECT MAX(sort_order) FROM admin_list_items WHERE category = 'cupLogoOptions'), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_list_items WHERE category = 'cupLogoOptions' AND value = 'As Per ROC Standard'
);

INSERT INTO admin_list_items (id, category, value, sort_order)
SELECT
  'suspensions-roc-standard',
  'suspensions',
  'As Per ROC Standard',
  COALESCE((SELECT MAX(sort_order) FROM admin_list_items WHERE category = 'suspensions'), 0) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_list_items WHERE category = 'suspensions' AND value = 'As Per ROC Standard'
);
