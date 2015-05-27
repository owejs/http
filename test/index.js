"use strict";

var owe = require("owe.js"),
	oweHttp = require("../src"),
	http = require("http"),
	fs = require("fs"),
	express = require("express");

var o = owe({
	a: "\u00bd + \u00bc = \u00be",
	b: [1, 2, 3],
	get c() {
		return {
			http: http,
			e: this.e,
			get handle() {
				return fs.createReadStream(__filename);
			},
			r: Math.random()
		};
	},
	d(word) {
		return "Hello " + word;
	},
	e: function() {
		var a = "";
		for(var i = 0; i < Math.pow(2, 21); i++)
			a += "a";
		return a;
	}()
}, owe.serve({
	router: {
		deep: true
	},
	closer: {
		filter: true
	}
}));

console.log(o.e.length);

var old = function(req, res) {
	res.writeHead(200, {
		"Content-Type": "application/json"
	});
	res.end(JSON.stringify(o.c));
};

var router = oweHttp(o);

http.createServer(router).listen(5000);
http.createServer(old).listen(5001);

express().get("/c", function(req, res) {
	res.send(o.c);
}).listen(5002);
