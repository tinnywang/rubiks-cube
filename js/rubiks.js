var gl;

function initWebGL(canvas) {
	if (!window.WebGLRenderingContext) {
		console.log("Your browser doesn't support WebGL.")
		return null;
	}
	gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
	if (!gl) {
		console.log("Your browser supports WebGL, but initialization failed.");
		return null;
	}
	return gl;
}

function getShader(gl, id) {
	var shaderScript = document.getElementById(id);
	if (!shaderScript) {
		return null;
	}
	var source = '';
	var currentChild = shaderScript.firstChild;
	while (currentChild) {
		if (currentChild.nodeType == currentChild.TEXT_NODE) {
			source += currentChild.textContent;
		}
		currentChild = currentChild.nextSibling;
	}
	var shader;
	if (shaderScript.type == 'x-shader/x-fragment') {
		shader = gl.createShader(gl.FRAGMENT_SHADER);
	} else if (shaderScript.type == 'x-shader/x-vertex') {
		shader = gl.createShader(gl.VERTEX_SHADER);
	} else {
		return null;
	}
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.log('An error occurred while compiling the shader: ' + gl.getShaderInfoLog(shader));
		return null;
	}
	return shader;
}

function initShaders() {
	var fragmentShader = getShader(gl, 'fragmentShader');
	var vertexShader = getShader(gl, 'vertexShader');
	var shaderProgram = gl.createProgram();
	gl.attachShader(shaderProgram, fragmentShader);
	gl.attachShader(shaderProgram, vertexShader);
	gl.linkProgram(shaderProgram);
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		console.log("Unable to initialize the shader program");
	}
	gl.useProgram(shaderProgram);
	var vertexPosition = gl.getAttribLocation(shaderProgram, 'vertexPosition');
	gl.enableVertexAttribArray(vertexPosition);
}

function start() {
	var canvas = document.getElementById("glcanvas");
	gl = initWebGL(canvas);
	initShaders();
	if (gl) {
		gl.clearColor(1.0, 1.0, 1.0, 1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}
}