import { VelogClient } from "./velog-client.js";
import { loadTokens } from "./auth.js";

async function check() {
  const tokens = loadTokens();
  if (!tokens) {
    console.log("No tokens found.");
    return;
  }
  const client = new VelogClient(tokens.accessToken, tokens.refreshToken);
  try {
    const user = await client.getCurrentUser();
    console.log("SUCCESS:", JSON.stringify(user, null, 2));
  } catch (err) {
    console.error("FAIL:", err);
  }
}
check();
