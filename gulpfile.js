"use strict";

const gulp = require("gulp");
const eslint = require("gulp-eslint");

gulp.task("eslint", () => {
	return gulp.src(["src/*.js", "test/*.test.js"])
		.pipe(eslint())
		.pipe(eslint.format())
		.pipe(eslint.failAfterError());
});

gulp.task("test", ["eslint"]);

gulp.task("watch", () => {
	gulp.start(["test"]);
	gulp.watch(["src/**", "test/**"], ["test"]);
});

gulp.task("default", ["watch"]);
