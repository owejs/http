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

		jsonReplacer: options.jsonReplacer,
		jsonSpace: options.jsonSpace,

		onSuccess: options.onSuccess || ((request, response, data) => data),
		onError: options.onError || ((request, response, err) => err),

		origin: options.origin || {}
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

			api.origin(Object.assign({}, options.origin, {
				http: true,
				request,
				response
			})).route(...route).close(closeData).then(
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

		if(typeof this.parseCloseData !== "function" || typeof this.parseRoute !== "function")
			throw expose(new Error("Invalid request."));

		return {
			route: this.parseRoute(request, response, parsedRequest.pathname),
			closeData: this.parseCloseData(request, response, parsedRequest.search)
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

		body(request, response) {
			return new Promise((resolve, reject) => {
				body(request, response, (err, body) => {
					if(err)
						return reject(err);
					resolve(body);
				});
			}).catch(expose);
		}
	},

	contentType(request, response, data) {
		const resourceData = owe.resource(data);
		let result;

		if("contentType" in resourceData)
			result = resourceData.contentType;
		else if((isStream.readable(data) || resourceData.stream) && "contentType" in data)
			result = data.contentType;

		if(!resourceData.file && !resourceData.stream) {
			if(typeof data === "string" || data && typeof data === "object" && data instanceof String)
				result = ["text/html", "text/plain", "application/json", "application/octet-stream"];
			else if(typeof data !== "object" || data && (data.toString && data.toString !== Object.prototype.toString || data.valueOf && data.valueOf !== Object.prototype.valueOf))
				result = ["application/json", "text/plain", "text/html", "application/octet-stream"];
			else
				result = "application/json";
		}

		if(result) {
			result = accepts(request).type(result);

			if(result)
				return result + (result.indexOf(";") === -1 && this && this.encoding ? `; charset=${this.encoding}` : "");
			else
				throw new Error("Requested type cannot be served.");
		}
	},

	parseResult(request, response, data, type) {
		const resourceData = owe.resource(data);

		if(typeof data === "function" && !resourceData.expose)
			return "";

		if(type.startsWith("application/json"))
			return JSON.stringify(data, (key, value) => {
				const resource = owe.resource(value);

				if(typeof resource.expose === "function")
					value = resource.expose(value);

				if(resource.expose !== undefined && typeof resource.expose !== "boolean")
					value = resource.expose;

				if(this && this.jsonReplacer)
					return this.jsonReplacer(key, value);

				return value;
			}, this && this.jsonSpace);

		return data;
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

			if(resourceData.expose === true)
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
