"use strict";

const gulp = require("gulp");
const jscs = require("gulp-jscs");

gulp.task("jscs", function() {
	return gulp.src(["src/*.js", "test/*.test.js"]).pipe(jscs());
});

gulp.task("test", ["jscs"]);

gulp.task("watch", function() {
	gulp.watch(["src/**", "test/**"], ["test"]);
});

gulp.task("default", ["watch", "test"]);
