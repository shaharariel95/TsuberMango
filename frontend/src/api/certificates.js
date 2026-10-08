import { getToken } from '../utils/auth';
const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL).toString().replace(/\/$/, '');

async function call(method, path, body) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

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
