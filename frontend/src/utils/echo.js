// True when a realtime event was caused by this very tab (it already applied the change locally).
// Events from older backends / scripts have no client id: fall back to comparing the user email.
export function isOwnEcho(event, { clientId, email }) {
  if (event.updatedByClient) return event.updatedByClient === clientId;
  return Boolean(email) && event.updatedBy === email;
}
