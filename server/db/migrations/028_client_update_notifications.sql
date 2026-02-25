CREATE UNIQUE INDEX IF NOT EXISTS idx_app_notifications_client_update_once_per_version
  ON app_notifications (user_id, notification_type, (payload_json->>'version'))
  WHERE notification_type = 'client_update_available'
    AND COALESCE(payload_json->>'version', '') <> '';

