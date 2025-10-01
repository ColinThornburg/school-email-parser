-- Fix the user creation trigger to handle all required columns

-- Drop the existing function and trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate function with proper error handling and all required fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Get email from raw_user_meta_data or email field
  user_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');

  -- Insert or update user record
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
  )
  ON CONFLICT (email)
  DO UPDATE SET
    auth_user_id = NEW.id,
    updated_at = NOW()
  WHERE users.email = user_email;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the auth
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
