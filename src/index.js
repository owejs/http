"use strict";

var owe = require("owe.js"),
	querystring = require("querystring"),
	url = require("url");

function oweHttp(api, options) {

	if(owe.isBound(api))
		api = owe.api(api);

	if(!owe.isApi(api))
		throw new TypeError("owe-http can only expose owe.Apis or bound object.");

	function sendResponse(request, response, data) {

		var sendAsJson = typeof data === "object";

		if(sendAsJson)
			data = JSON.stringify(data);

		response.setHeader("Content-Type", sendAsJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
		response.setHeader("Content-Length", Buffer.byteLength(data, "utf-8"));

		response.end(data, "utf8");
	}

	return function servedHttpRequestListener(request, response) {
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

			response.statusCode = 200;

			sendResponse(request, response, result);
		}, function(err) {

			response.statusCode = 404;
			if(typeof err === "object" && err !== null && typeof err.message === "string")
				response.statusMessage = err.message;

			sendResponse(request, response, err);
		});
	};

}

module.exports = oweHttp;
