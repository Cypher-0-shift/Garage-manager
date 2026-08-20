# Development Notes

## Authentication Bypass (Development Mode)

The Firebase authentication has been temporarily disabled for development purposes. This allows you to login with **any email and password combination**.

### What Was Changed

1. **`src/pages/Auth.tsx`**
   - Login handler now accepts any credentials and stores auth state in localStorage
   - Signup handler accepts any credentials without Firebase validation
   - Auth state listener is commented out

2. **`src/components/ProtectedRoute.tsx`**
   - Checks localStorage instead of Firebase auth state
   - No Firebase auth listener active

3. **`src/components/Navigation.tsx`**
   - Logout clears localStorage instead of Firebase auth

4. **`src/pages/Settings.tsx`**
   - Logout clears localStorage instead of Firebase auth

### How It Works

- On login/signup: Stores `isAuthenticated: "true"` in localStorage
- On protected routes: Checks localStorage for authentication
- On logout: Clears localStorage and redirects to auth page

### Testing

1. Start the dev server: `npm run dev`
2. Navigate to: `http://localhost:5173`
3. Enter any email/password combination
4. Click "Login" or "Sign Up"
5. You'll be redirected to the dashboard

### Re-enabling Firebase Auth

To restore Firebase authentication:

1. Open the modified files listed above
2. Find comment blocks marked with `ORIGINAL FIREBASE AUTH CODE - COMMENTED OUT`
3. Uncomment those code blocks
4. Comment out or remove the bypass logic (marked with `BYPASSED AUTHENTICATION`)
5. Ensure your `.env` file has valid Firebase credentials

## Dev Server

- **Local URL:** http://localhost:5173/
- **Start command:** `npm run dev`
- **Build command:** `npm run build`

## Notes

- The `.env` file is excluded from git for security
- Firebase credentials in `src/integrations/firebase/client.ts` are still present but not actively used
- All original Firebase code is preserved in comments for easy restoration
