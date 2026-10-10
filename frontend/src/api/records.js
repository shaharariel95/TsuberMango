import { call } from './http';

const f = encodeURIComponent;
export const deleteRecord = (farmer, id) => call('DELETE', `/farmers/${f(farmer)}/records/${f(id)}`);
export const listDeletedRecords = (farmer) => call('GET', `/admin/farmers/${f(farmer)}/deleted-records`);
export const restoreRecord = (farmer, id) => call('POST', `/admin/farmers/${f(farmer)}/records/${f(id)}/restore`);
export const updateRecord = (farmer, id, record) => call('PUT', `/farmers/${f(farmer)}/records/${f(id)}`, record);
// Mark for shipment (toSend = true) or take back off it. The body is the selected rows themselves.
export const markForShipment = (farmer, pallets, toSend) =>
  call('POST', `/farmers/${f(farmer)}/destinations/${toSend ? 'toSend' : 'Sent'}`, pallets);
export const setShipmentDate = (farmer, palletIds, shipmentDate) =>
  call('PUT', `/farmers/${f(farmer)}/records/shipmentDate`, { palletIds, shipmentDate });
// Returns { updated: [stored state per pallet] } (certified rows also lose cardId).
export const resetSent = (farmer, palletIds) => call('PUT', `/farmers/${f(farmer)}/records/resetPallets`, { palletIds });
