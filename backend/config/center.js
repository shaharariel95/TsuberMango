// Single source of the current tenant id. Real per-subdomain / custom-claims
// resolution is deferred to task 23; for now this is a constant.
const CENTER_ID = process.env.CENTER_ID || 'tsuberi';

module.exports = { CENTER_ID };
