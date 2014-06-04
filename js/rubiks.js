var canvas;
var gl;
var shaderProgram;
var vertexPosition;
var vertexColor;
var perspectiveMatrix;
var cubeVerticesBuffer;
var cubeVerticesIndexBuffer;
var cubeVerticesColorBuffer;
var cubeOutlineIndexBuffer;

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
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, fragmentShader);
    gl.attachShader(shaderProgram, vertexShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.log("Unable to initialize the shader program");
    }
    gl.useProgram(shaderProgram);
    vertexPosition = gl.getAttribLocation(shaderProgram, 'vertexPosition');
    gl.enableVertexAttribArray(vertexPosition);
    vertexColor = gl.getAttribLocation(shaderProgram, 'vertexColor');
    gl.enableVertexAttribArray(vertexColor);
}

function initCubeBuffer() {
    // Create a buffer for the cube's vertices.

    cubeVerticesBuffer = gl.createBuffer();

    // Select the cubeVerticesBuffer as the one to apply vertex
    // operations to from here out.

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffer);

    // Now create an array of vertices for the cube.

    var vertices = [
        // Front face
        -1.0, -1.0,  1.0,
        1.0, -1.0,  1.0,
        1.0,  1.0,  1.0,
        -1.0,  1.0,  1.0,

        // Back face
        -1.0, -1.0, -1.0,
        -1.0,  1.0, -1.0,
        1.0,  1.0, -1.0,
        1.0, -1.0, -1.0,

        // Top face
        -1.0,  1.0, -1.0,
        -1.0,  1.0,  1.0,
        1.0,  1.0,  1.0,
        1.0,  1.0, -1.0,

        // Bottom face
        -1.0, -1.0, -1.0,
        1.0, -1.0, -1.0,
        1.0, -1.0,  1.0,
        -1.0, -1.0,  1.0,

        // Right face
        1.0, -1.0, -1.0,
        1.0,  1.0, -1.0,
        1.0,  1.0,  1.0,
        1.0, -1.0,  1.0,

        // Left face
        -1.0, -1.0, -1.0,
        -1.0, -1.0,  1.0,
        -1.0,  1.0,  1.0,
        -1.0,  1.0, -1.0
            ];

    // Now pass the list of vertices into WebGL to build the shape. We
    // do this by creating a Float32Array from the JavaScript array,
    // then use it to fill the current vertex buffer.

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    // Build the element array buffer; this specifies the indices
    // into the vertex array for each face's vertices.

    cubeVerticesIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);

    // This array defines each face as two triangles, using the
    // indices into the vertex array to specify each triangle's
    // position.

    var cubeVertexIndices = [
        0,  1,  2,      0,  2,  3,    // front
        4,  5,  6,      4,  6,  7,    // back
        8,  9,  10,     8,  10, 11,   // top
        12, 13, 14,     12, 14, 15,   // bottom
        16, 17, 18,     16, 18, 19,   // right
        20, 21, 22,     20, 22, 23    // left
    ]

    // Now send the element array to GL

    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
                new Uint16Array(cubeVertexIndices), gl.STATIC_DRAW);

    var colors = [
        [1.0, 1.0, 1.0, 1.0], // front face: white
        [1.0, 0.0, 0.0, 1.0], // back face: red
        [0.0, 1.0, 0.0, 1.0], // top face: green
        [0.0, 0.0, 1.0, 1.0], // bottom face: blue
        [1.0, 1.0, 0.0, 1.0], // right face: yellow
        [1.0, 0.5, 0.0, 1.0], // left face: orange
    ]
    var generatedColors = [];
    for (var i = 0; i < 6; i++) {
        var color = colors[i];
        for (var j = 0; j < 4; j++) {
            generatedColors = generatedColors.concat(color);
        }
    }
    cubeVerticesColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(generatedColors), gl.STATIC_DRAW);

    /*
    cubeOutlineIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeOutlineIndexBuffer);

    var cubeOutlineIndices = [
        0,  1,  2,  3,  0,
        4,  5,  6,  7,  4,
        8,  9,  10, 11, 8,
        12, 13, 14, 15, 12,
        16, 17, 18, 19, 16,
        20, 21, 22, 23, 20
    ]

    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(cubeOutlineIndices), gl.STATIC_DRAW);
    */
}

function reshape() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    perspectiveMatrix = makePerspective(120,
            canvas.width / canvas.height,
            0.1,
            100.0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawRubiksCube();
}

function drawCube() {
    initCubeBuffer();
    loadIdentity();
    mvTranslate([0.0, 0.0, -6.0]);
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffer);
    gl.vertexAttribPointer(vertexPosition, 3, gl.FLOAT, false, 0, 0);
    // cube colors
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesColorBuffer);
    gl.vertexAttribPointer(vertexColor, 4, gl.FLOAT, false, 0, 0);
    // cube faces
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);
    setMatrixUniforms();
    gl.drawElements(gl.TRIANGLE_STRIP, 36, gl.UNSIGNED_SHORT, 0);

    // cube outline
    /*
       gl.lineWidth(1.0);
       gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeOutlineIndexBuffer);
       setMatrixUniforms();
       gl.drawElements(gl.LINE_LOOP, 30, gl.UNSIGNED_SHORT, 0);
     */

}

function drawRubiksCube() {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    drawCube();
}

function start() {
    canvas = document.getElementById("glcanvas");
    gl = initWebGL(canvas);
    initShaders();
    if (gl) {
        gl.clearColor(0.0, 0.0, 1.0, 1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    reshape();
}
