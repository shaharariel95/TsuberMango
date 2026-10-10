import { call } from './http';

export const previewCertificates = (farmer, recordIds) => call('POST', '/certificates/preview', { farmer, recordIds });
export const issueCertificates = (farmer, recordIds) => call('POST', '/certificates', { farmer, recordIds });
export const reprintCertificate = (id) => call('POST', `/certificates/${encodeURIComponent(id)}/reprint`);
export const removePalletFromCertificate = (id, recordId) => call('POST', `/certificates/${encodeURIComponent(id)}/remove-pallet`, { recordId });
export const listCertificates = (farmer, { from, to } = {}) => {
  const q = new URLSearchParams({ farmer, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  return call('GET', `/certificates?${q}`);
};
export const getCertificate = (id) => call('GET', `/certificates/${encodeURIComponent(id)}`);
export const getCertificateVersion = (id, n) => call('GET', `/certificates/${encodeURIComponent(id)}/versions/${n}`);
export const getCertificateProfile = (farmer) => call('GET', `/admin/farmers/${encodeURIComponent(farmer)}/certificate-profile`);
export const saveCertificateProfile = (farmer, profile) => call('PUT', `/admin/farmers/${encodeURIComponent(farmer)}/certificate-profile`, profile);
export const exportSeasonRecords = () => call('GET', '/admin/export/records');
