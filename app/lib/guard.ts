import { currentUser, unauthorized } from "./auth";
import { authStore } from "./store";

export async function requireSession(request: Request) {
  try {
    const user = await currentUser(request, await authStore());
    return user ? { user } : { response: unauthorized() };
  } catch (error) {
    console.error("session guard:", error);
    return {
      response: Response.json(
        { error: "Sign-in is temporarily unavailable." },
        { status: 503 },
      ),
    };
  }
}
