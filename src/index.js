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

		parseRequest: options.parseRequest || oweHttp.parseRequest,

		parseRoute: options.parseRoute || oweHttp.parseRoute,

		parseCloseData: options.parseCloseData || oweHttp.parseCloseData.simple,

		contentType: options.contentType || oweHttp.contentType,

		parseResult: options.parseResult || oweHttp.parseResult,

		jsonReplacer: options.jsonReplacer || oweHttp.jsonReplacer,
		jsonSpace: options.jsonSpace,

		onSuccess: options.onSuccess || ((request, response, data) => data),
		onError: options.onError || ((request, response, err) => err)
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
		]).then(result => {

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
		}, err => failResponse(request, response, options, err));
	};
}

/* Default parsers: */

Object.assign(oweHttp, {
	parseRequest(request, response) {
		const parsedRequest = url.parse(request.url, true);

		let parseCloseData;

		if(typeof this.parseCloseData === "function")
			parseCloseData = this.parseCloseData;
		else if(typeof this.parseCloseData === "object")
			parseCloseData = this.parseCloseData[request.method] || this.parseCloseData.all;

		if(typeof parseCloseData !== "function" || typeof this.parseRoute !== "function")
			throw expose(new Error("Invalid request."));

		return {
			route: this.parseRoute(request, response, parsedRequest.pathname),
			closeData: parseCloseData(request, response, parsedRequest.search)
		};
	},

	parseRoute(request, response, path) {

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

	parseCloseData: {
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
			return new Promise((resolve, reject) => {
				body(request, response, (err, body) => {
					if(err)
						return reject(err);
					resolve(body);
				});
			});
		}
	},

	contentType(request, response, data) {
		const resourceData = owe.resource(data);
		let result;

		if("contentType" in resourceData)
			result = resourceData.contentType;
		else if((isStream.readable(data) || resourceData.stream) && "contentType" in data)
			result = data.contentType;

		if(!resourceData.file && !resourceData.stream)
			result = typeof data === "string" || (data && typeof data === "object" && data instanceof String) ? ["text/html", "text/plain", "application/json", "application/octet-stream"] : ["application/json", "text/plain", "text/html", "application/octet-stream"];

		if(result) {
			result = accepts(request).type(result);

			if(result)
				return result + (result.indexOf(";") === -1 && this && this.encoding ? "; charset=" + this.encoding : "");
			else
				throw new Error("Requested type cannot be served.");
		}
	},

	parseResult(request, response, data, type) {

		const resourceData = owe.resource(data);

		if(typeof data === "function" && !resourceData.expose)
			return "";

		if(type.startsWith("application/json"))
			return JSON.stringify(data, this && this.jsonReplacer, this && this.jsonSpace);

		return data;
	},

	jsonReplacer(key, value) {
		const exposed = owe.resource(value).expose;

		return exposed !== undefined ? exposed : value;
	}
});

function successResponse(request, response, options, data) {
	response.statusCode = 200;
	try {
		sendResponse(request, response, options, options.onSuccess(request, response, data));
	}
	catch(err) {
		failResponse(request, response, options, err);
	}
}

function expose(err) {
	return owe.resource(err, {
		expose: true
	});
}

function failResponse(request, response, options, err) {

	err = options.onError(request, response, err);

	const isObjErr = err && typeof err === "object";

	let status;

	if(isObjErr) {
		const resourceData = owe.resource(err);

		if("status" in resourceData)
			status = resourceData.status;
		else if("status" in err)
			status = err.status;

		if("statusMessage" in resourceData)
			response.statusMessage = resourceData.statusMessage;
		else if("statusMessage" in err)
			response.statusMessage = err.statusMessage;

		if(resourceData.expose) {
			if(status === undefined)
				status = 400;

			Object.defineProperty(err, "message", {
				value: err.message,
				enumerable: true
			});
		}
		else
			err = {};
	}

	response.statusCode = status || 500;

	sendResponse(request, response, options, err);
}

function sendResponse(request, response, options, data) {

	const type = options.contentType(request, response, data);
	const resourceData = owe.resource(data);

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
