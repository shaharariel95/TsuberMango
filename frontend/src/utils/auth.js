import { auth } from "../main";
import { clientId } from "./clientId";

// Await a valid (auto-refreshed) Firebase ID token. Throws if signed out.
export async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.getIdToken();
}

// Headers for raw fetch() calls: auth token + this tab's realtime client id.
export async function authHeaders() {
  return { Authorization: `Bearer ${await getToken()}`, 'X-Client-Id': clientId };
}
