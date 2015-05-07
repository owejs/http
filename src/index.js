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

		console.log(parsedRequest);

		for(let i = 1; i < path.length; i++) {
			let c = path.charAt(i);
			if(c === "/") {
				route.push(querystring.unescape(currRoute));
				currRoute = "";
			}
			else
				currRoute += c;
		}
		route.push(querystring.unescape(currRoute));

		var currApi = api;
		for(let r of route)
			currApi = currApi.route(r);

		var closeData;

		if(parsedRequest.search !== "") {
			let getKeys = Object.keys(parsedRequest.query);

			if(getKeys.length === 1 && parsedRequest.search.indexOf("=") === -1)
				closeData = getKeys[0];
			else
				closeData = parsedRequest.query;
		}

		currApi.close(closeData).then(function(result) {

			var t2 = process.hrtime();

			console.log((t2[0] - t[0]) * 1000 + (t2[1] - t[1]) / 1000000);

			var sendAsJson = typeof result === "object";

			if(sendAsJson)
				result = JSON.stringify(result);

			response.writeHead(200, {
				"Content-Type": sendAsJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
				"Content-Length": Buffer.byteLength(result, "utf-8")
			});

			response.end(result, "utf8");

		}, function(err) {

			var sendAsJson = typeof result === "object";

			if(sendAsJson)
				err = JSON.stringify(err);

			response.writeHead(404, {
				"Content-Type": sendAsJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
				"Content-Length": Buffer.byteLength(err, "utf-8")
			});
			response.end(err, "utf8");
		});
	};

}

module.exports = oweHttp;
