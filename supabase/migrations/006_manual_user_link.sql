-- First, let's see what auth users exist
SELECT id, email, created_at
FROM auth.users
WHERE email = 'colin.thornburg@gmail.com'
ORDER BY created_at DESC
LIMIT 1;

-- If the above returns a record, manually link it
-- Replace YOUR_AUTH_USER_ID with the id from the query above
-- UPDATE public.users
-- SET auth_user_id = 'YOUR_AUTH_USER_ID', updated_at = NOW()
-- WHERE email = 'colin.thornburg@gmail.com';
