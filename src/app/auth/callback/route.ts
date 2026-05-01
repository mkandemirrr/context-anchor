import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

/**
 * GET /auth/callback
 *
 * Handles OAuth and email confirmation callbacks from Supabase.
 * Exchanges the auth code for a session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Use configured app URL for production, fall back to request origin
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || origin;

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${siteUrl}${next}`);
    }
    console.error("Auth callback error:", error.message);
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${siteUrl}/login?error=auth_callback_failed`);
}
