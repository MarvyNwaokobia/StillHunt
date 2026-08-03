// Auth signing was previously needed to set a Supabase JWT session for RLS.
// The app now uses the Railway API directly — no JWT required for current endpoints.
export function useHuntAuth() {}
