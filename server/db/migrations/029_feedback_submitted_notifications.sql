CREATE UNIQUE INDEX IF NOT EXISTS idx_app_notifications_feedback_once_per_feedback
  ON app_notifications (user_id, notification_type, (payload_json->>'feedbackId'))
  WHERE notification_type = 'feedback_submitted'
    AND COALESCE(payload_json->>'feedbackId', '') <> '';

