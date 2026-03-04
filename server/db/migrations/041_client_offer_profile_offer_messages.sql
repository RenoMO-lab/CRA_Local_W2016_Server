ALTER TABLE client_offer_profile_settings
ADD COLUMN IF NOT EXISTS offer_message_en text NOT NULL DEFAULT '';

ALTER TABLE client_offer_profile_settings
ADD COLUMN IF NOT EXISTS offer_message_zh text NOT NULL DEFAULT '';

UPDATE client_offer_profile_settings
SET offer_message_en = 'Thank you for the opportunity to support your project.
Please find below our customized quotation, developed to ensure reliability, performance, and cost efficiency in line with your expectations. We are ready to proceed at your convenience.'
WHERE COALESCE(trim(offer_message_en), '') = '';

UPDATE client_offer_profile_settings
SET offer_message_zh = '感谢您的关注，请查收以下报价内容。'
WHERE COALESCE(trim(offer_message_zh), '') = '';
