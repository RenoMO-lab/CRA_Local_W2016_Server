CREATE UNIQUE INDEX IF NOT EXISTS idx_app_notifications_status_integrity_once_per_day
  ON app_notifications (user_id, notification_type, (payload_json->>'snapshotDate'))
  WHERE notification_type = 'status_integrity_alert'
    AND COALESCE(payload_json->>'snapshotDate', '') <> '';
