-- This migration links existing users to Supabase Auth users
-- Run this AFTER you've successfully authenticated with Google

-- First, let's check if there are any orphaned users (users without auth_user_id)
-- We'll need to manually link them after auth

-- For now, just make sure the trigger works better
-- Update the trigger to NOT fail if user already exists

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  existing_user_id UUID;
BEGIN
  -- Get email from raw_user_meta_data or email field
  user_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');

  -- Check if a user with this email already exists
  SELECT id INTO existing_user_id
  FROM public.users
  WHERE email = user_email;

  IF existing_user_id IS NOT NULL THEN
    -- Update existing user record with auth_user_id
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      updated_at = NOW()
    WHERE id = existing_user_id;

    RAISE NOTICE 'Updated existing user % with auth_user_id %', user_email, NEW.id;
  ELSE
    -- Insert new user record
    INSERT INTO public.users (
      id,
      auth_user_id,
      email,
      gmail_token,
      gmail_refresh_token,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      NEW.id,
      user_email,
      NULL, -- Will be updated after OAuth callback
      NULL, -- Will be updated after OAuth callback
      NOW(),
      NOW()
    );

    RAISE NOTICE 'Created new user % with auth_user_id %', user_email, NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the auth
    RAISE WARNING 'Error in handle_new_user: %, SQLSTATE: %', SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates or updates user record when auth.users record is created';
