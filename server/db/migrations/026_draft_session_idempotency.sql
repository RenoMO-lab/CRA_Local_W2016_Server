CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_draft_session_unique
  ON requests ((data->>'createdBy'), (data->>'draftSessionKey'))
  WHERE status = 'draft'
    AND COALESCE(data->>'createdBy', '') <> ''
    AND COALESCE(data->>'draftSessionKey', '') <> '';
