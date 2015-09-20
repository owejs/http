"use strict";

const owe = require("owe-core");
const isStream = require("is-stream");
const querystring = require("querystring");
const qs = require("qs");
const body = require("body/any");
const accepts = require("accepts");
const url = require("url");

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
			const parsedRequest = url.parse(request.url, true);

			let parseCloseData = undefined;

			if(typeof this.parseCloseData === "function")
				parseCloseData = this.parseCloseData;
			else if(typeof this.parseCloseData === "object")
				parseCloseData = this.parseCloseData[request.method] || this.parseCloseData.all;

			if(typeof parseCloseData !== "function" || typeof this.parseRoute !== "function")
				throw new Error("Invalid request.");

			return {
				route: this.parseRoute(request, response, parsedRequest.pathname),
				closeData: parseCloseData(request, response, parsedRequest.search)
			};
		},

		parseRoute: options.parseRoute || function(request, response, path) {

			const route = [];

			let currRoute = "";

			for(let i = 1; i < path.length; i++) {
				const c = path.charAt(i);

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
			const resourceData = owe.resourceData(data);
			let result;

			if("contentType" in resourceData)
				result = resourceData.contentType;
			else if((isStream.readable(data) || resourceData.stream) && "contentType" in data)
				result = data.contentType;

			if(!resourceData.file && !resourceData.stream)
				result = typeof data === "string" || (data && typeof data === "object" && data instanceof String) ? ["text/html", "text/plain", "application/json"] : ["application/json", "text/plain", "text/html"];

			if(result) {
				result = accepts(request).type(result);

				if(result)
					return result + (result.indexOf(";") === -1 && options.encoding ? "; charset=" + options.encoding : "");
			}
		},

		parseResult: options.parseResult || function(request, response, data, type) {
			if(type.startsWith("application/json"))
				return JSON.stringify(data, this.jsonReplacer, this.jsonSpace);

			return data;
		},

		jsonReplacer: options.jsonReplacer,
		jsonSpace: options.jsonSpace,

		onSuccess: options.onSuccess || function(request, response, data) {
			return data;
		},
		onError: options.onError || function(request, response, err) {
			return err;
		}
	};

	return function servedHttpRequestListener(request, response) {

		let parsedRequest;

		try {
			parsedRequest = options.parseRequest(request, response);
		}
		catch(err) {
			failResponse(request, response, options, err);

			return;
		}

		Promise.all([
			parsedRequest.route,
			parsedRequest.closeData
		]).then(function(result) {

			const route = result[0];
			const closeData = result[1];

			request.oweRoute = route;

			let currApi = api.origin({
				http: true,
				request,
				response
			});

			for(let r of route)
				currApi = currApi.route(r);

			currApi.close(closeData).then(
				successResponse.bind(null, request, response, options),
				failResponse.bind(null, request, response, options)
			);
		}, function(err) {
			failResponse(request, response, options, err);
		});
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
	},

	body(request, response, search) {
		return new Promise(function(resolve, reject) {
			body(request, response, function(err, body) {
				if(err)
					return reject(err);
				resolve(body);
			});
		});
	}
};

function successResponse(request, response, options, data) {
	response.statusCode = 200;
	sendResponse(request, response, options, options.onSuccess(request, response, data));
}

function failResponse(request, response, options, err) {

	err = options.onError(request, response, err);

	const isObjErr = err && typeof err === "object";

	let status = 500;

	if(isObjErr) {
		const resourceData = owe.resourceData(err);

		const exposeMessage = function() {

			status = 400;

			Object.defineProperty(err, "message", {
				value: err.message,
				enumerable: true
			});
		};

		const hideError = function() {
			err = {};
		};

		if("expose" in resourceData) {
			if(resourceData.expose)
				exposeMessage();
			else
				hideError();
		}
		else if("expose" in err) {
			if(err.expose)
				exposeMessage();
			else
				hideError();
		}

		if("status" in resourceData)
			status = resourceData.status;
		else if("status" in err)
			status = err.status;

		if("statusMessage" in resourceData)
			response.statusMessage = resourceData.statusMessage;
		else if("statusMessage" in err)
			response.statusMessage = err.statusMessage;
	}

	response.statusCode = status;

	sendResponse(request, response, options, err);
}

function sendResponse(request, response, options, data) {

	const type = options.contentType(request, response, data);
	const resourceData = owe.resourceData(data);

	if(type != null && !response.headersSent && !response.getHeader("Content-Type"))
		response.setHeader("Content-Type", type);

	if(isStream.readable(data) || resourceData.stream) {

		if(!response.headersSent) {
			if("contentLength" in resourceData)
				response.setHeader("Content-Length", resourceData.contentLength);
			else if("contentLength" in data)
				response.setHeader("Content-Length", data.contentLength);
		}

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
