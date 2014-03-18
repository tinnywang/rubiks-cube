var gl;

function initWebGL(canvas) {
	gl = null;
	try {
		gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
	} catch (e) {
	}
	if (!gl) {
		alert("Your browser doesn't support WebGL");
		gl = null;
	}
	return gl;
}

function start() {
	var canvas = document.getElementById("glcanvas");
	gl = initWebGL(canvas);
	if (gl) {
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}
}