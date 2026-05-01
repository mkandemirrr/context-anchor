require('dotenv').config({ path: '.env.local' });

async function testCheckout() {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID_MONTHLY;

  console.log("Using API Key starting with:", apiKey.substring(0, 15));
  console.log("Store ID:", storeId);
  console.log("Variant ID:", variantId);

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
            email: "test@example.com",
            custom: { user_id: "test-user-id" },
          },
          product_options: {
            redirect_url: `http://localhost:3333/dashboard?upgraded=true`,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}

testCheckout();
