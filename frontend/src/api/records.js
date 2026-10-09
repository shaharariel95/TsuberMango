import { call } from './http';

const f = encodeURIComponent;
export const deleteRecord = (farmer, id) => call('DELETE', `/farmers/${f(farmer)}/records/${f(id)}`);
export const listDeletedRecords = (farmer) => call('GET', `/admin/farmers/${f(farmer)}/deleted-records`);
export const restoreRecord = (farmer, id) => call('POST', `/admin/farmers/${f(farmer)}/records/${f(id)}/restore`);
