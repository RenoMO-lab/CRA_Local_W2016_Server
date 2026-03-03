ALTER TABLE client_offer_profile_settings
ADD COLUMN IF NOT EXISTS address_zh text NOT NULL DEFAULT '';

UPDATE client_offer_profile_settings
SET address_zh = '山东省青岛平度市同和街道办事处高尔夫路51号'
WHERE COALESCE(trim(address_zh), '') = '';
