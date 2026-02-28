CREATE TABLE IF NOT EXISTS client_offer_profile_settings (
  id integer PRIMARY KEY,
  company_name_local text NOT NULL DEFAULT '',
  company_name_en text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id text NULL REFERENCES app_users(id) ON DELETE SET NULL
);

INSERT INTO client_offer_profile_settings
  (id, company_name_local, company_name_en, address, phone, email, contact_name)
VALUES
  (
    1,
    '青岛蒙路可机械有限公司',
    'Qingdao Monroc Mechanical Co., LTD',
    'Tonghe Industrial Zone,Pingdu,Qingdao,P.R.C',
    '+86 132 5688 9718',
    'kevin@sonasia.monroc.com',
    'Kevin Zhu'
  )
ON CONFLICT (id) DO NOTHING;
