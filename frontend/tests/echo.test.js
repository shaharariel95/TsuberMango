import { describe, it, expect } from 'vitest';
import { isOwnEcho } from '../src/utils/echo.js';

const me = { clientId: 'tab-a', email: 'a@x' };

describe('isOwnEcho', () => {
  it('skips only events from this tab', () => {
    expect(isOwnEcho({ updatedByClient: 'tab-a', updatedBy: 'a@x' }, me)).toBe(true);
    expect(isOwnEcho({ updatedByClient: 'tab-b', updatedBy: 'a@x' }, me)).toBe(false); // same account, other device
  });
  it('falls back to the email when the event has no client id', () => {
    expect(isOwnEcho({ updatedBy: 'a@x' }, me)).toBe(true);
    expect(isOwnEcho({ updatedBy: 'b@x' }, me)).toBe(false);
  });
  it('never skips when nothing identifies the sender', () => {
    expect(isOwnEcho({}, { clientId: 'tab-a', email: '' })).toBe(false);
  });
});
