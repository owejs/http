"use strict";

var owe = require("owe-core"),
	isStream = require("is-stream"),
	querystring = require("querystring"),
	url = require("url");

function oweHttp(api, options) {

	if(owe.isBound(api))
		api = owe.api(api);

	if(!owe.isApi(api))
		throw new TypeError("owe-http can only expose owe.Apis or bound object.");

	if(typeof options !== "object" || options === null)
		options = {};

	options = {

	};

	return function servedHttpRequestListener(request, response) {
		var parsedRequest = url.parse(request.url, true),
			path = parsedRequest.pathname,
			currRoute = "",
			route = [];

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

		var currApi = api.origin({
			type: "http",
			request: request,
			response: response
		});
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

		currApi.close(closeData).then(
			successResponse.bind(null, request, response),
			failResponse.bind(null, request, response)
		);
	};
}

function successResponse(request, response, data) {
	response.statusCode = 200;
	sendResponse(request, response, data);
}

function failResponse(request, response, err) {

	if(typeof err === "object" && err !== null && typeof err.message === "string") {

		response.statusCode = err.status || 404;

		response.statusMessage = err.message;
		Object.defineProperty(err, "message", {
			enumerable: true,
			value: err.message
		});
	}
	else
		response.statusCode = 404;

	sendResponse(request, response, err);
}

function sendResponse(request, response, data) {

	if(isStream.readable(data) || owe.resourceData(data).stream) {
		data.once("error", failResponse.bind(null, request, response));
		data.pipe(response);
		return;
	}

	var sendAsJson = typeof data === "object";

	if(sendAsJson)
		data = JSON.stringify(data);

	data = String(data);

	if(!response.headersSent) {

		if(response.getHeader("Content-Type"))
			response.setHeader("Content-Type", (sendAsJson ? "application/json" : "text/html") + "; charset=utf-8");

		if(response.getHeader("Content-Length"))
			response.setHeader("Content-Length", Buffer.byteLength(data, "utf8"));
	}

	response.end(data, "utf8");
}

module.exports = oweHttp;
