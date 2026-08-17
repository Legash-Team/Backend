// Mounted LAST in server.js, after every route.
// Catches anything passed to next(err) from any controller, plus uncaught errors Express
// routes to here automatically. Never leaks a raw stack trace to the client.
//
// Every error response follows the standard shape from API_CONTRACT.md:
//   { success: false, error: "human-readable message" }

function errorHandler(err, req, res, next) {
  console.error(err); // full details in the server log, not in the response

  let status = err.statusCode || 500;
  let message = err.statusCode
    ? err.message
    : 'Something went wrong. Please try again.';

  // MongoDB duplicate key (E11000) -> 409 Conflict, as specified in API_CONTRACT.md
  // (409 duplicate phone/email/license). Without this, a duplicate surfaces as a
  // misleading 500.
  if (err.code === 11000) {
    status = 409;
    message = 'A record with that email, phone, or license number already exists.';
  }

  res.status(status).json({
    success: false,
    error: message,
  });
}

module.exports = errorHandler;