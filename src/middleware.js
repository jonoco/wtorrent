export function logger(req, res, next ) {
	const timestamp = new Date().toString();
	const log = `Request: ${timestamp} ${req.method} ${req.url}`;
	console.log(log);
	next();
}