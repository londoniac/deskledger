-- Invitations system for accountant portal
-- Business owners invite accountants by email; accountants accept to gain read access

CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email      TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'accountant' CHECK(role IN ('accountant')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  accepted_at   TIMESTAMPTZ
);

CREATE INDEX idx_inv_from ON invitations(from_user_id);
CREATE INDEX idx_inv_to_email ON invitations(to_email);

-- RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Business owners see invitations they sent
CREATE POLICY "Owners manage sent invitations"
  ON invitations FOR ALL
  USING (from_user_id = auth.uid());

-- Accountants see invitations sent to their email
CREATE POLICY "Accountants see received invitations"
  ON invitations FOR SELECT
  USING (
    to_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Accountants can update invitations sent to them (accept/decline)
CREATE POLICY "Accountants update received invitations"
  ON invitations FOR UPDATE
  USING (
    to_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Update handle_new_user trigger to read account_type from signup metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' = 'accountant' THEN
    user_role := 'accountant';
  ELSE
    user_role := 'user';
  END IF;

  INSERT INTO public.user_profiles (id, email, role, trial_ends_at)
  VALUES (NEW.id, NEW.email, user_role, now() + interval '14 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
