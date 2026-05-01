import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-server";
import crypto from "crypto";

/**
 * POST /api/webhooks/lemon-squeezy
 *
 * Handles Lemon Squeezy webhook events for subscription management.
 * Events handled:
 * - subscription_created: Activate Pro tier
 * - subscription_updated: Update expiration
 * - subscription_cancelled: Schedule downgrade
 * - subscription_expired: Downgrade to Free
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-signature") ?? "";

    // Verify webhook signature
    const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("LEMON_SQUEEZY_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    const hmac = crypto.createHmac("sha256", webhookSecret);
    hmac.update(rawBody);
    const digest = hmac.digest("hex");

    if (digest !== signature) {
      console.error("Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const eventName = payload.meta?.event_name;
    const customData = payload.meta?.custom_data;
    const userId = customData?.user_id;

    if (!userId) {
      console.error("No user_id in webhook custom_data");
      return NextResponse.json(
        { error: "Missing user_id" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();
    const subscriptionData = payload.data?.attributes;

    switch (eventName) {
      case "order_created": {
        // One-time payment (Top-up)
        // Fetch current free chats
        const { data: profile } = await supabase
          .from("profiles")
          .select("free_chats_remaining")
          .eq("id", userId)
          .single();
          
        const currentChats = profile?.free_chats_remaining || 0;
        
        const { error } = await supabase
          .from("profiles")
          .update({
            free_chats_remaining: currentChats + 100,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Failed to add top-up chats:", error);
        } else {
          console.log(`⚡ Added 100 top-up chats to user ${userId}`);
        }
        break;
      }

      case "subscription_created":
      case "subscription_resumed": {
        // Activate Pro subscription
        const expiresAt =
          subscriptionData?.renews_at ?? subscriptionData?.ends_at;
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: "pro",
            subscription_source: "lemon_squeezy",
            subscription_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Failed to activate subscription:", error);
          return NextResponse.json(
            { error: "Database update failed" },
            { status: 500 }
          );
        }

        console.log(`✅ Subscription activated for user ${userId}`);
        break;
      }

      case "subscription_updated": {
        // Update subscription details
        const expiresAt =
          subscriptionData?.renews_at ?? subscriptionData?.ends_at;
        const status = subscriptionData?.status;

        const tier =
          status === "active" || status === "on_trial" ? "pro" : "free";

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: tier,
            subscription_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Failed to update subscription:", error);
        }

        console.log(`🔄 Subscription updated for user ${userId}: ${tier}`);
        break;
      }

      case "subscription_cancelled": {
        // Mark as cancelled but keep Pro until expiration
        const endsAt = subscriptionData?.ends_at;
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_expires_at: endsAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Failed to process cancellation:", error);
        }

        console.log(
          `⚠️ Subscription cancelled for user ${userId}, expires at ${endsAt}`
        );
        break;
      }

      case "subscription_expired": {
        // Downgrade to Free tier
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_tier: "free",
            subscription_source: null,
            subscription_expires_at: null,
            free_chats_remaining: 0, // Don't grant new free chats on downgrade
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) {
          console.error("Failed to expire subscription:", error);
        }

        console.log(`❌ Subscription expired for user ${userId}`);
        break;
      }

      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
