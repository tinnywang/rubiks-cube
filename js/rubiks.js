var canvas;
var gl;
var rubiksCube;
var eye = [0, 0, -10];
var center = [0, 0, 0];
var up = [0, 1, 0];

var rightMouseDown = false;
var x_init_right;
var y_init_right;
var x_new_right;
var y_new_right;
var leftMouseDown = false;
var x_init_left;
var y_init_left;
var x_new_left;
var y_new_left;

var shaderProgram;
var vertexPosition;
var vertexNormal;
var lighting;
var ambient;
var diffuse;
var specular;
var shininess;

var modelViewMatrix = mat4.create();
var projectionMatrix = mat4.create();
var rotationMatrix = mat4.create();

var cubeVerticesBuffer;
var cubeNormalsBuffer;
var cubeFacesBuffer;
var stickerVerticesBuffer;
var stickerNormalsBuffer;
var stickerFacesBuffer;

var pickingFramebuffer;
var pickingTexture;
var renderBuffer;

var COLORS = {
    'blue': [0.0, 0.0, 1.0, 1.0],
    'green': [0.0, 1.0, 0.0, 1.0],
    'orange': [1.0, 0.5, 0.0, 1.0],
    'red': [1.0, 0.0, 0.0, 1.0],
    'white': [1.0, 1.0, 1.0, 1.0],
    'yellow': [1.0, 1.0, 0.0, 1.0]
}

function RubiksCube() {
    this.cubes = new Array(3);
    for (var x = 0; x < 3; x++) {
        this.cubes[x] = new Array(3);
        for (var y = 0; y < 3; y++) {
            this.cubes[x][y] = new Array(3);
            for (var z = 0; z < 3; z++) {
                var coordinates = [x - 1, y - 1, z - 1];
                var color = [x / 3, y / 3, z / 3, 1.0];
                this.cubes[x][y][z] = new Cube(coordinates, color);
            }
        }
    }

    this.selectedCube = null;

    this.draw = function() {
        mat4.perspective(projectionMatrix, 30, canvas.width / canvas.height, 0.1, 100.0);
        mat4.identity(modelViewMatrix);
        mat4.lookAt(modelViewMatrix, eye, center, up);
        mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);
        var mvMatrix = mat4.create();
        mat4.copy(mvMatrix, modelViewMatrix);
        for (var x = -1; x < 2; x++) {
            for (var y = -1; y < 2; y++) {
                for (var z = -1; z < 2; z++) {
                    var cube = this.cubes[x + 1][y + 1][z + 1];
                    cube.draw(cubeModel.ambient);
                    for (var i = 0; i < cube.stickers.length; i++) {
                        cube.stickers[i].draw();
                    }
                    mat4.copy(modelViewMatrix, mvMatrix);
                }
            }
        }
    }

    this.drawToFramebuffer = function() {
        mat4.perspective(projectionMatrix, 30, canvas.width / canvas.height, 0.1, 100.0);
        mat4.identity(modelViewMatrix);
        mat4.lookAt(modelViewMatrix, eye, center, up);
        mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);
        var mvMatrix = mat4.create();
        mat4.copy(mvMatrix, modelViewMatrix);
        for (var x = -1; x < 2; x++) {
            for (var y = -1; y < 2; y++) {
                for (var z = -1; z < 2; z++) {
                    var cube = this.cubes[x + 1][y + 1][z + 1];
                    cube.draw([(x + 1) / 3, (y + 1) / 3, (z + 1) / 3, 1.0]);
                    mat4.copy(modelViewMatrix, mvMatrix);
                }
            }
        }
        mat4.copy(modelViewMatrix, mvMatrix);
    }
}

function Cube(coordinates, color) {
    this.coordinates = coordinates;
    this.color = color;
    this.rotationMatrix = mat4.create();
    this.translationVector = vec3.create();
    vec3.scale(this.translationVector, this.coordinates, 2);

    this.transform = function() {
        mat4.multiply(modelViewMatrix, modelViewMatrix, this.rotationMatrix);
        mat4.translate(modelViewMatrix, modelViewMatrix, this.translationVector);
    }

    this.stickers = [];
    var x = this.coordinates[0];
    var y = this.coordinates[1];
    var z = this.coordinates[2];
    if (x == -1) {
        this.stickers.push(new Sticker(this, COLORS['red'], function() {
            this.cube.transform();
            mat4.translate(modelViewMatrix, modelViewMatrix, [-1.001, 0, 0]);
            mat4.rotateZ(modelViewMatrix, modelViewMatrix, degreesToRadians(90));
        }));
    } else if (x == 1) {
        this.stickers.push(new Sticker(this, COLORS['orange'], function() {
            this.cube.transform();
            mat4.translate(modelViewMatrix, modelViewMatrix, [1.001, 0, 0]);
            mat4.rotateZ(modelViewMatrix, modelViewMatrix, degreesToRadians(-90));
        }));
    }
    if (y == -1) {
        this.stickers.push(new Sticker(this, COLORS['yellow'], function() {
            this.cube.transform();
            mat4.translate(modelViewMatrix, modelViewMatrix, [0, -1.001, 0]);
            mat4.rotateX(modelViewMatrix, modelViewMatrix, degreesToRadians(-180));
        }));
    } else if (y == 1) {
        this.stickers.push(new Sticker(this, COLORS['white'], function() {
            this.cube.transform();
            mat4.translate(modelViewMatrix, modelViewMatrix, [0, 1.001, 0]);
            setMatrixUniforms();
        }));
    }
    if (z == 1) {
        this.stickers.push(new Sticker(this, COLORS['green'], function() {
            this.cube.transform();
            mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, 1.001]);
            mat4.rotateX(modelViewMatrix, modelViewMatrix, degreesToRadians(90));
        }));
    } else if (z == -1) {
        this.stickers.push(new Sticker(this, COLORS['blue'], function() {
            this.cube.transform();
            mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, -1.001]);
            mat4.rotateX(modelViewMatrix, modelViewMatrix, degreesToRadians(-90));
        }));
    }

    this.draw = function(color) {
        var mvMatrix = mat4.create();
        mat4.copy(mvMatrix, modelViewMatrix);
        this.transform();
        setMatrixUniforms();

        gl.uniform4fv(ambient, color);
        gl.uniform4fv(diffuse, cubeModel.diffuse);
        gl.uniform4fv(specular, cubeModel.specular);
        gl.uniform1f(shininess, cubeModel.shininess);
        // vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffer);
        gl.vertexAttribPointer(vertexPosition, 3, gl.FLOAT, false, 0, 0);
        // normals
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalsBuffer);
        gl.vertexAttribPointer(vertexNormal, 3, gl.FLOAT, false, 0, 0);
        // faces
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeFacesBuffer);
        gl.drawElements(gl.TRIANGLES, cubeModel.faces.length, gl.UNSIGNED_SHORT, 0);

        mat4.copy(modelViewMatrix, mvMatrix);
    }
}

function Sticker(cube, color, transform) {
    this.cube = cube;
    this.color = color;
    this.transform = transform;
    this.draw = function() {
        var mvMatrix = mat4.create();
        mat4.copy(mvMatrix, modelViewMatrix)
        this.transform();
        setMatrixUniforms();

        gl.uniform4fv(ambient, this.color);
        gl.uniform4fv(diffuse, stickerModel.diffuse);
        gl.uniform4fv(specular, stickerModel.specular);
        gl.uniform1f(shininess, stickerModel.shininess);
        // vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, stickerVerticesBuffer);
        gl.vertexAttribPointer(vertexPosition, 3, gl.FLOAT, false, 0, 0);
        // normals
        gl.bindBuffer(gl.ARRAY_BUFFER, stickerNormalsBuffer);
        gl.vertexAttribPointer(vertexNormal, 3, gl.FLOAT, false, 0, 0);
        // faces
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, stickerFacesBuffer);
        gl.drawElements(gl.TRIANGLES, stickerModel.faces.length, gl.UNSIGNED_SHORT, 0);

        mat4.copy(modelViewMatrix, mvMatrix);
    }
}

function initWebGL(canvas) {
    if (!window.WebGLRenderingContext) {
        console.log("Your browser doesn't support WebGL.")
            return null;
    }
    gl = canvas.getContext('webgl', {preserveDrawingBuffer: true}) || canvas.getContext('experimental-webgl', {preserveDrawingBuffer: true});
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
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

function initTextureFramebuffer() {
    pickingFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFramebuffer);

    pickingTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, pickingTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    renderBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickingTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function initShaders() {
    var fragmentShader = getShader(gl, 'fragmentShader');
    var vertexShader = getShader(gl, 'vertexShader');
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, fragmentShader);
    gl.attachShader(shaderProgram, vertexShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.log('Unable to initialize the shader program');
    }
    gl.useProgram(shaderProgram);
    vertexPosition = gl.getAttribLocation(shaderProgram, 'vertexPosition');
    gl.enableVertexAttribArray(vertexPosition);
    vertexNormal = gl.getAttribLocation(shaderProgram, 'vertexNormal');
    gl.enableVertexAttribArray(vertexNormal);
    eyePosition = gl.getUniformLocation(shaderProgram, 'eyePosition');
    gl.uniform3fv(eyePosition, eye);
    lighting = gl.getUniformLocation(shaderProgram, 'lighting');
    ambient = gl.getUniformLocation(shaderProgram, 'ambient');
    diffuse = gl.getUniformLocation(shaderProgram, 'diffuse');
    specular = gl.getUniformLocation(shaderProgram, 'specular');
    shininess = gl.getUniformLocation(shaderProgram, 'shininess');
}

function initCubeBuffers() {
    // vertices
    cubeVerticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeModel.vertices), gl.STATIC_DRAW);
    // normals
    cubeNormalsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeModel.vertex_normals), gl.STATIC_DRAW);
    // faces
    cubeFacesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeFacesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeModel.faces), gl.STATIC_DRAW);
}

function initStickerBuffers() {
    // vertices
    stickerVerticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, stickerVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stickerModel.vertices), gl.STATIC_DRAW);
    // normals
    stickerNormalsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, stickerNormalsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stickerModel.vertex_normals), gl.STATIC_DRAW);
    // faces
    stickerFacesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, stickerFacesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(stickerModel.faces), gl.STATIC_DRAW);
}

function drawScene() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(lighting, 0);
    rubiksCube.drawToFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(lighting, 1);
    rubiksCube.draw();
}

function tick() {
    requestAnimationFrame(tick);
    drawScene();
}

function start() {
    canvas = document.getElementById('glcanvas');
    gl = initWebGL(canvas);
    initTextureFramebuffer();
    initShaders();
    initCubeBuffers();
    initStickerBuffers();
    rubiksCube = new RubiksCube();
    if (gl) {
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        tick();
    }
}

function setMatrixUniforms() {
    var projectionUniform = gl.getUniformLocation(shaderProgram, 'projectionMatrix');
    gl.uniformMatrix4fv(projectionUniform, false, projectionMatrix);
    var modelViewUniform = gl.getUniformLocation(shaderProgram, 'modelViewMatrix');
    gl.uniformMatrix4fv(modelViewUniform, false, modelViewMatrix);
    var _normalMatrix = mat4.create();
    mat4.invert(_normalMatrix, modelViewMatrix);
    mat4.transpose(_normalMatrix, _normalMatrix);
    var normalMatrix = mat3.create();
    mat3.fromMat4(normalMatrix, _normalMatrix);
    var normalMatrixUniform = gl.getUniformLocation(shaderProgram, 'normalMatrix');
    gl.uniformMatrix3fv(normalMatrixUniform, false, normalMatrix);
}

function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

function colorToCubeCoordinates(rgb) {
    var coordinates = [];
    for (i = 0; i < rgb.length; i++) {
        coordinates.push(rgb[i] / 255 * 3);
    }
    return coordinates;
}

function findSelectedCube(x, y) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFramebuffer);
    var pixelValues = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixelValues);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    var i = (x + y * canvas.width) * 4;
    var coordinates = colorToCubeCoordinates(pixelValues.subarray(i, i + 3));
    if (coordinates[0] >= 3 || coordinates[1] >= 3 || coordinates[2] >= 3) { // clicked outside the cube
        return null;
    } else {
        return rubiksCube.cubes[coordinates[0]][coordinates[1]][coordinates[2]];
    }
}

/*
 * Returns an array of cubes that share the same AXIS coordinate as CUBE.
 * AXIS is 0, 1, or 2 for the x-, y-, or z-coordinate.
 */
function getCubesInLayer(cube, axis) {
    var axisValue = cube.coordinates[axis] + 1;
    var cubes = [];
    var x, y, z;
    if (axis == 0) { // x
        for (y = 0; y < 3; y++) {
            for (z = 0; z < 3; z++) {
                cubes.push(rubiksCube.cubes[axisValue][y][z]);
            }
        }
    } else if (axis == 1) { // y
        for (x = 0; x < 3; x++) {
            for (z = 0; z < 3; z++) {
                cubes.push(rubiksCube.cubes[x][axisValue][z]);
            }
        }
    } else if (axis == 2) { // z
        for (x = 0; x < 3; x++) {
            for (y = 0; y < 3; y++) {
                cubes.push(rubiksCube.cubes[x][y][axisValue]);
            }
        }
    }
    return cubes;
}

/*
 * Rotates CUBES around AXIS.  AXIS is 0, 1, or 2 for the x-, y-, or z-axis.
 */

function rotateLayer(cubes, axis, degrees) {
    var newRotationMatrix = mat4.create();
    mat4.rotateY(newRotationMatrix, newRotationMatrix, degreesToRadians(degrees));
    for (var i = 0; i < cubes.length; i++) {
        var cube = cubes[i];
        mat4.multiply(cube.rotationMatrix, newRotationMatrix, cube.rotationMatrix);
    }
}

function rotate(event) {
    if (rightMouseDown) {
        x_new_right = event.pageX;
        y_new_right = event.pageY;
        var delta_x = (x_new_right - x_init_right) / 50;
        var delta_y = (y_new_right - y_init_right) / 50;
        var axis = [delta_y, -delta_x, 0];
        var degrees = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
        var newRotationMatrix = mat4.create();
        mat4.rotate(newRotationMatrix, newRotationMatrix, degreesToRadians(degrees), axis);
        mat4.multiply(rotationMatrix, newRotationMatrix, rotationMatrix);
    } else if (leftMouseDown) {
        if (!rubiksCube.selectedCube) {
            return;
        }
        x_new_left = event.pageX;
        y_new_left = event.pageY;
        var delta_x = (x_new_left - x_init_left) / 50;
        var delta_y = (y_new_left - y_init_left) / 50;
        var degrees = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
        // find all cubes in the same 'layer'
        // we only do rotations around the y-axis for now
        var cubes = getCubesInLayer(rubiksCube.selectedCube, 1);
        rotateLayer(cubes, 1, degrees);
    }
}

function startRotate(event) {
    if (event.button == 0) { // left mouse
        leftMouseDown = true;
        x_init_left = event.pageX;
        y_init_left = event.pageY;
        rubiksCube.selectedCube = findSelectedCube(x_init_left, canvas.height - y_init_left);
    } else if (event.button == 2) { // right mouse
        rightMouseDown = true;
        x_init_right = event.pageX;
        y_init_right = event.pageY;
    }
}

function endRotate(event) {
    if (event.button == 0) { // left mouse
        leftMouseDown = false;
    } else if (event.button == 2) { // right mouse
        rightMouseDown = false;
    }
}

$(document).ready(function() {
    start();
    $('#glcanvas').bind('contextmenu', function(e) { return false; });
    $('#glcanvas').mousedown(startRotate);
    $('#glcanvas').mousemove(rotate);
    $('#glcanvas').mouseup(endRotate);
});
