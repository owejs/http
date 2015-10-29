"use strict";

const gulp = require("gulp");
const eslint = require("gulp-eslint");

gulp.task("eslint", () => {
	return gulp.src(["src/*.js", "test/*.test.js"])
		.pipe(eslint())
		.pipe(eslint.format())
		.pipe(eslint.failOnError());
});

gulp.task("test", ["eslint"]);

gulp.task("watch", () => {
	gulp.watch(["src/**", "test/**"], ["test"]);
});

gulp.task("default", ["watch", "test"]);
