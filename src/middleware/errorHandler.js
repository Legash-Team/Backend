// Mounted LAST in server.js, after every route.
// Catches anything passed to next(err) from any controller, plus uncaught errors Express
// routes to here automatically. Never leaks a raw stack trace to the client.
//
// Every error response follows the standard shape from API_CONTRACT.md:
//   { success: false, error: "human-readable message" }

function errorHandler(err, req, res, next) {
  console.error(err); // full details in the server log, not in the response

  const status = err.statusCode || 500;
  const message = err.statusCode
    ? err.message
    : 'Something went wrong. Please try again.';

  res.status(status).json({
    success: false,
    error: message,
  });
}

module.exports = errorHandler;