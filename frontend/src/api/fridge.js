import { call } from './http';

const f = encodeURIComponent;
// Room + live pallet summaries: { cells, updatedAt, updatedBy, pallets }.
export const getRoom = (roomId) => call('GET', `/fridge/${f(roomId)}`);
// op: {op:'place', slot, farmer, palletNumber} | {op:'move', from, to} | {op:'clear', slot}. Returns the room.
export const postOp = (roomId, op) => call('POST', `/fridge/${f(roomId)}/ops`, op);
