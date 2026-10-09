// One id per browser tab (memory only). Sent as X-Client-Id and echoed back on realtime events,
// so a tab ignores its own writes but still sees the same account's writes from another device.
const fallback = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const clientId = globalThis.crypto?.randomUUID?.() ?? fallback();
