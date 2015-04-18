"use strict";

var owe = require("owe.js"),
	querystring = require("querystring"),
	url = require("url");

function oweHttp(api, options) {

	if(owe.isBound(api))
		api = owe.api(api);

	if(!owe.isApi(api))
		throw new TypeError("owe-http can only expose owe.Apis or bound object.");

	return function servedHttpRequestListener(request, response) {
		var t = process.hrtime();
		var parsedRequest = url.parse(request.url, true),
			path = parsedRequest.pathname,
			currRoute = "",
			route = [];

		for(let i = 1; i < path.length; i++) {
			let c = path.charAt(i);
			if(c === "/") {
				route.push(querystring.unescape(currRoute));
				currRoute = "";
				continue;
			}
			currRoute += c;
		}
		route.push(querystring.unescape(currRoute));

		var currApi = api;
		for(let r of route)
			currApi = currApi.route(r);

		var t2 = process.hrtime();

		console.log((t2[0] - t[0]) * 1000 + (t2[1] - t[1]) / 1000000);

		currApi.close().then(function(result) {
			response.writeHead(200, {
				"Content-Type": typeof result === "object" ? "application/json" : "text/plain"
			});
			response.end(JSON.stringify(result), "utf8");
		}, function(err) {
			response.writeHead(404, {
				"Content-Type": typeof result === "object" ? "application/json" : "text/plain"
			});
			response.end(JSON.stringify(err), "utf8");
		});
	};

}

module.exports = oweHttp;
