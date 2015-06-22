"use strict";

var owe = require("owe-core"),
	isStream = require("is-stream"),
	querystring = require("querystring"),
	qs = require("qs"),
	url = require("url");

function oweHttp(api, options) {

	if(owe.isBound(api))
		api = owe.api(api);

	if(!owe.isApi(api))
		throw new TypeError("owe-http can only expose owe.Apis or bound object.");

	if(typeof options !== "object" || options === null)
		options = {};

	options = {

		encoding: "utf8",

		parseRequest: options.parseRequest || function(request, response) {
			var parsedRequest = url.parse(request.url, true);

			return {
				route: this.parseRoute(request, response, parsedRequest.pathname),
				closeData: this.parseCloseData(request, response, parsedRequest.search)
			};
		},

		parseRoute: options.parseRoute || function(request, response, path) {
			var currRoute = "",
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

			return route;
		},

		parseCloseData: options.parseCloseData || oweHttp.parseCloseData.simple,

		contentType: options.contentType || function(request, response, data) {
			var resourceData = owe.resourceData(data);

			if("contentType" in resourceData)
				return resourceData.contentType;

			if((isStream.readable(data) || resourceData.stream) && "contentType" in data)
				return data.contentType;

			if(resourceData.file || resourceData.stream)
				return;

			return typeof data === "object" ? "application/json" : "text/html";
		},

		parseResult: options.parseResult || function(request, response, data, type) {
			if(type === "application/json")
				return JSON.stringify(data, this.jsonReplacer, this.jsonSpace);

			return data;
		},

		jsonReplacer: options.jsonReplacer,
		jsonSpace: options.jsonSpace,

		onSuccess: options.onSuccess || function(request, response, data) {
			return data;
		},
		onFail: options.onFail || function(request, response, err) {
			return err;
		}
	};

	return function servedHttpRequestListener(request, response) {

		var parsedRequest,
			route,
			closeData;

		try {
			parsedRequest = options.parseRequest(request, response);
			route = parsedRequest.route;
			closeData = parsedRequest.closeData;
		}
		catch(err) {
			failResponse(request, response, options, err);

			return;
		}

		var currApi = api.origin({
			http: true,
			request: request,
			response: response
		});

		for(let r of route)
			currApi = currApi.route(r);

		currApi.close(closeData).then(
			successResponse.bind(null, request, response, options),
			failResponse.bind(null, request, response, options)
		);
	};
}

oweHttp.parseCloseData = {
	simple(request, response, search) {
		if(search === "")
			return;

		return querystring.parse(search.slice(1));
	},
	extended(request, response, search) {
		if(search === "")
			return;

		return qs.parse(search.slice(1));
	}
};

function successResponse(request, response, options, data) {
	response.statusCode = 200;
	sendResponse(request, response, options, options.onSuccess(request, response, data));
}

function failResponse(request, response, options, err) {

	err = options.onFail(request, response, err);

	if(typeof err === "object" && err !== null && "status" in err)
		response.statusCode = err.status;
	else
		response.statusCode = 404;

	sendResponse(request, response, options, err);
}

function sendResponse(request, response, options, data) {

	var type = options.contentType(request, response, data),
		resourceData = owe.resourceData(data);

	if(type != null && !response.headersSent && !response.getHeader("Content-Type"))
		response.setHeader("Content-Type", type + (options.encoding ? "; charset=" + options.encoding : ""));

	if(isStream.readable(data) || resourceData.stream) {

		if(!response.headersSent && "contentLength" in resourceData)
			response.setHeader("Content-Length", resourceData.contentLength);

		data.once("error", failResponse.bind(null, request, response, options));
		data.pipe(response);

		return;
	}

	data = String(options.parseResult(request, response, data, type));

	if(!response.headersSent && !response.getHeader("Content-Length"))
		response.setHeader("Content-Length", Buffer.byteLength(data, options.encoding));

	response.end(data, options.encoding);
}

module.exports = oweHttp;
