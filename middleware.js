"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.logger = logger;
function logger(req, res, next) {
	var timestamp = new Date().toString();
	var log = "Request: " + timestamp + " " + req.method + " " + req.url;
	console.log(log);
	next();
}