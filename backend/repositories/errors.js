// Errors repositories throw for a request that conflicts with the record's current state.
// `status` is the HTTP status the controller should answer with; `message` is user-facing (Hebrew).
class RecordStateError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RecordStateError';
    this.status = status;
  }
}

module.exports = { RecordStateError };
