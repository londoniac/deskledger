-- Additional profile fields for CT600 computation
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS associated_companies INTEGER DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS brought_forward_losses NUMERIC(12,2) DEFAULT 0;
