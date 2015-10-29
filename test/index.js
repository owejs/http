"use strict";

const owe = require("owe.js");
const oweHttp = require("../src");
const http = require("http");
const fs = require("fs");
const express = require("express");

const o = owe({
	a: "\u00bd + \u00bc = \u00be",
	b: [1, 2, 3],
	get c() {
		return {
			http,
			e: this.e,
			get handle() {
				return fs.createReadStream(__filename);
			},
			r: Math.random()
		};
	},
	d(word) {
		return `Hello ${word}`;
	},
	e: function() {
		let a = "";

		for(let i = 0; i < Math.pow(2, 21); i++)
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

const old = function(req, res) {
	res.writeHead(200, {
		"Content-Type": "application/json"
	});
	res.end(JSON.stringify(o.c));
};

const router = oweHttp(o);

http.createServer(router).listen(5000);
http.createServer(old).listen(5001);

express().get("/c", (req, res) => {
	res.send(o.c);
}).listen(5002);
