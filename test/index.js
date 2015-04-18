var owe = require("owe.js"),
	oweHttp = require("../src"),
	http = require("http");

var o = owe({
	a: "test",
	b: [1, 2, 3],
	c: http,
	d: function(word) {
		return "Hello " + word;
	}
}, owe.serve({
	closer: {
		filter: true
	}
}));

var old = function(req, res) {
	res.writeHead(200, {
		"Content-Type": "application/json"
	});
	res.end(JSON.stringify(o.c));
};

var router = oweHttp(o);

http.createServer(router).listen(5000);
