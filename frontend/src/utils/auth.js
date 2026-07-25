import { auth } from "../main";

// Await a valid (auto-refreshed) Firebase ID token. Throws if signed out.
export async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.getIdToken();
}
