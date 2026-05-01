import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/checkout
 *
 * Creates a Lemon Squeezy checkout session for Pro subscription.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email, plan = "monthly" } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "userId and email are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
    const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
    
    let variantId = process.env.LEMON_SQUEEZY_VARIANT_ID_MONTHLY;
    if (plan === "yearly") variantId = process.env.LEMON_SQUEEZY_VARIANT_ID_YEARLY;
    if (plan === "topup") variantId = process.env.LEMON_SQUEEZY_VARIANT_ID_TOPUP;

    if (!apiKey || !storeId || !variantId) {
      return NextResponse.json(
        { error: "Payment system not configured" },
        { status: 500 }
      );
    }

    // Create Lemon Squeezy checkout
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email,
              custom: {
                user_id: userId,
              },
            },
            product_options: {
              redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
            },
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: storeId,
              },
            },
            variant: {
              data: {
                type: "variants",
                id: variantId,
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Lemon Squeezy error:", errorData);
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    const checkoutData = await response.json();
    const checkoutUrl = checkoutData.data?.attributes?.url;

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
