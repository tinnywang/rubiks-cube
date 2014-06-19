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
var init_coordinates;
var new_coordinates;
var isRotating = false;

var shaderProgram;
var vertexPosition;
var vertexNormal;
var vertexColor;
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
var normalsCubeVerticesBuffer;
var normalsCubeNormalsBuffer;
var normalsCubeFacesBuffer;

var pickingFramebuffer;
var pickingTexture;
var pickingRenderBuffer;
var normalsFramebuffer;
var normalsTexture;
var normalsRenderBuffer;

var COLORS = {
    'blue': [0.0, 0.0, 1.0, 1.0],
    'green': [0.0, 1.0, 0.0, 1.0],
    'orange': [1.0, 0.5, 0.0, 1.0],
    'red': [1.0, 0.0, 0.0, 1.0],
    'white': [1.0, 1.0, 1.0, 1.0],
    'yellow': [1.0, 1.0, 0.0, 1.0]
}
var DEGREES = 5;
var MARGIN_OF_ERROR = 1e-3;
var X_AXIS = 0;
var Y_AXIS = 1;
var Z_AXIS = 2;
var LEFT_MOUSE = 0;
var RIGHT_MOUSE = 2;

function RubiksCube() {
    this.selectedCube = null;
    this.rotatedCubes = null;
    this.rotationAxis = null;
    this.axisConstant = null;
    this.rotationAngle = 0;
    this.degrees = DEGREES;
    this.normalsCube = new NormalsCube();
    this.cubes = new Array(3);
    for (var r = 0; r < 3; r++) {
        this.cubes[r] = new Array(3);
        for (var g = 0; g < 3; g++) {
            this.cubes[r][g] = new Array(3);
            for (var b = 0; b < 3; b++) {
                var coordinates = [r - 1, g - 1, b - 1];
                var color = [r / 3, g / 3, b / 3, 1.0];
                this.cubes[r][g][b] = new Cube(coordinates, color);
            }
        }
    }

    this.draw = function() {
        mat4.perspective(projectionMatrix, 30, canvas.width / canvas.height, 0.1, 100.0);
        mat4.identity(modelViewMatrix);
        mat4.lookAt(modelViewMatrix, eye, center, up);
        mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);
        var mvMatrix = mat4.create();
        for (var r = 0; r < 3; r++) {
            for (var g = 0; g < 3; g++) {
                for (var b = 0; b < 3; b++) {
                    var cube = this.cubes[r][g][b];
                    cube.draw(cubeModel.ambient);
                    for (var s in cube.stickers) {
                        cube.stickers[s].draw();
                    }
                }
            }
        }
    }

    this.drawToPickingFramebuffer = function() {
        gl.uniform1i(lighting, 0);
        mat4.perspective(projectionMatrix, 30, canvas.width / canvas.height, 0.1, 100.0);
        mat4.identity(modelViewMatrix);
        mat4.lookAt(modelViewMatrix, eye, center, up);
        mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);
        var mvMatrix = mat4.create();
        for (var r = 0; r < 3; r++) {
            for (var g = 0; g < 3; g++) {
                for (var b = 0; b < 3; b++) {
                    var cube = this.cubes[r][g][b];
                    cube.draw(cube.color);
                }
            }
        }
        gl.uniform1i(lighting, 1);
    }

    this.drawToNormalsFramebuffer = function() {
        mat4.perspective(projectionMatrix, 30, canvas.width / canvas.height, 0.1, 100.0);
        mat4.identity(modelViewMatrix);
        mat4.lookAt(modelViewMatrix, eye, center, up);
        mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);
        var mvMatrix = mat4.create();
        mat4.copy(mvMatrix, modelViewMatrix);
        this.normalsCube.draw();
    }

    /*
     * Sets this.rotatedCubes to an array of cubes that share the same AXIS coordinate as this.selectedCube.
     * AXIS is 0, 1, or 2 for the x-, y-, or z-coordinate.
     */
    this.setRotatedCubes = function() {
        if (!this.rotationAxis) {
            return;
        }
        var value = this.selectedCube.coordinates[this.axisConstant];
        var cubes = [];
        for (var r = 0; r < 3; r++) {
            for (var g = 0; g < 3; g++) {
                for (var b = 0; b < 3; b++) {
                    var cube = this.cubes[r][g][b];
                    if (Math.abs(cube.coordinates[this.axisConstant] - value) < MARGIN_OF_ERROR) {
                        cubes.push(cube);
                    }
                }
            }
        }
        if (cubes.length == 9) {
            this.rotatedCubes = cubes;
        }
    }

    /*
     * Rotates this.rotatedCubes around this.rotationAxis by this.degrees.
     */
    this.rotateLayer = function() {
        if (Math.abs(this.rotationAngle) == 90) {
            this.rotationAngle = 0;
            isRotating = false;
            return;
        }

        this.rotationAngle += this.degrees;

        var newRotationMatrix = mat4.create();
        mat4.rotate(newRotationMatrix, newRotationMatrix, degreesToRadians(this.degrees), this.rotationAxis);

        for (var c in this.rotatedCubes) {
            var cube = this.rotatedCubes[c];
            vec3.transformMat4(cube.coordinates, cube.coordinates, newRotationMatrix);
            mat4.multiply(cube.rotationMatrix, newRotationMatrix, cube.rotationMatrix);
        }
    }

    this.colorToCube = function(rgba) {
        var r = rgba[0];
        var g = rgba[1];
        var b = rgba[2];
        if (r == 255 && g == 255 && b == 255) { // clicked outside the cube
            return null;
        } else {
            return this.cubes[r % 3][g % 3][b % 3];
        }
    }

    this.selectCube = function(x, y) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFramebuffer);
        var pixelValues = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelValues);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.selectedCube = this.colorToCube(pixelValues);
    }

    this.setRotationAxis = function(x, y, direction) {
        var normal = this.normalsCube.getNormal(event.pageX, canvas.height - event.pageY);
        if (!normal) {
            return;
        }
        var axis = vec3.create();
        vec3.cross(axis, normal, direction);
        var x = Math.round(axis[0]);
        var y = Math.round(axis[1]);
        var z = Math.round(axis[2]);
        this.rotationAxis = Math.abs(x + y + z) == 1 ? [x, y, z] : null;
        if (!this.rotationAxis) {
            this.axisConstant = null;
            return;
        }
        if (x == 1 || x == -1) {
            this.axisConstant = X_AXIS;
        } else if (y == 1 || y == -1) {
            this.axisConstant = Y_AXIS;
        } else if (z == 1 || z == -1 ) {
            this.axisConstant = Z_AXIS;
        }
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

function NormalsCube() {
    this.COLORS = {
        'blue': [0.0, 0.0, 1.0, 1.0],
        'green': [0.0, 1.0, 0.0, 1.0],
        'orange': [1.0, 0.5, 0.0, 1.0],
        'red': [1.0, 0.0, 0.0, 1.0],
        'black': [0.0, 0.0, 0.0, 1.0],
        'yellow': [1.0, 1.0, 0.0, 1.0]
    }
    this.NORMALS = {
        'blue': [-1, 0, 0],
        'green': [0, 0, -1],
        'orange': [1, 0, 0],
        'red': [0, 0, 1],
        'black': [0, -1, 0],
        'yellow': [0, 1, 0]
    }

    this.draw = function() {
        var mvMatrix = mat4.create();
        mat4.copy(mvMatrix, modelViewMatrix);
        mat4.scale(modelViewMatrix, modelViewMatrix, [3, 3, 3]);
        setMatrixUniforms();

        gl.uniform1i(lighting, 0);
        // vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, normalsCubeVerticesBuffer);
        gl.vertexAttribPointer(vertexPosition, 3, gl.FLOAT, false, 0, 0);
        // normals
        gl.bindBuffer(gl.ARRAY_BUFFER, normalsCubeNormalsBuffer);
        gl.vertexAttribPointer(vertexNormal, 3, gl.FLOAT, false, 0, 0);
        // faces
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, normalsCubeFacesBuffer);
        var offset = 0;
        for (var c in this.COLORS) {
            var color = this.COLORS[c];
            gl.uniform4fv(ambient, this.COLORS[c]);
            gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, offset);
            gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, offset + normalsCubeModel.faces.length)
            offset += 6;
        }

        mat4.copy(modelViewMatrix, mvMatrix);
        gl.uniform1i(lighting, 1);
    }

    this.colorToNormal = function(rgba) {
        var r = (rgba[0] / 255).toFixed(1);
        var g = (rgba[1] / 255).toFixed(1);
        var b = (rgba[2] / 255).toFixed(1);
        for (var c in this.COLORS) {
            var color = this.COLORS[c];
            if (r == color[0] && g == color[1] && b == color[2]) {
                return this.NORMALS[c];
            }
        }
        return null;
    }

    this.getNormal = function(x, y) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, normalsFramebuffer);
        var pixelValues = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelValues);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return this.colorToNormal(pixelValues);
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

    pickingRenderBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickingRenderBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickingTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickingRenderBuffer);

    normalsFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, normalsFramebuffer);

    normalsTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, normalsTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
 
    normalsRenderBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, normalsRenderBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, normalsTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, normalsRenderBuffer);

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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeModel.normals), gl.STATIC_DRAW);
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stickerModel.normals), gl.STATIC_DRAW);
    // faces
    stickerFacesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, stickerFacesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(stickerModel.faces), gl.STATIC_DRAW);
}

function initNormalsCubeBuffers() {
    // vertices
    normalsCubeVerticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalsCubeVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normalsCubeModel.vertices), gl.STATIC_DRAW);
    // normals
    normalsCubeNormalsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalsCubeNormalsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normalsCubeModel.normals), gl.STATIC_DRAW);
    // faces
    normalsCubeFacesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, normalsCubeFacesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(normalsCubeModel.faces), gl.STATIC_DRAW);
}

function drawScene() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    if (isRotating) {
        rubiksCube.rotateLayer();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, normalsFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    rubiksCube.drawToNormalsFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, pickingFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    rubiksCube.drawToPickingFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
    initNormalsCubeBuffers();
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

function unproject(dest, vec, view, proj, viewport) {
    var m = mat4.create();
    var v = vec4.create();

    v[0] = (vec[0] - viewport[0]) * 2.0 / viewport[2] - 1.0;
    v[1] = (vec[1] - viewport[1]) * 2.0 / viewport[3] - 1.0;
    v[2] = 2.0 * vec[2] - 1.0;
    v[3] = 1.0;

    mat4.multiply(m, proj, view);
    mat4.invert(m, m);

    vec4.transformMat4(v, v, m);
    if (v[3] == 0.0) {
        return null;
    }

    dest[0] = v[0] / v[3];
    dest[1] = v[1] / v[3];
    dest[2] = v[2] / v[3];

    return dest;
}

function screenToObjectCoordinates(x, y) {
    var objectCoordinates = vec3.create();
    var screenCoordinates = [x, y, 0];
    unproject(objectCoordinates, screenCoordinates, modelViewMatrix, projectionMatrix, [0, 0, canvas.width, canvas.height])
    return objectCoordinates;
}

function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
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
    } else if (leftMouseDown && !isRotating) {
        new_coordinates = screenToObjectCoordinates(event.pageX, canvas.height - event.pageY);
        var direction = vec3.create();
        vec3.subtract(direction, new_coordinates, init_coordinates);
        vec3.normalize(direction, direction);
        rubiksCube.setRotationAxis(event.pageX, canvas.height - event.pageY, direction);
        rubiksCube.setRotatedCubes();
        isRotating = rubiksCube.rotatedCubes && rubiksCube.rotationAxis;
    }
}

function startRotate(event) {
    if (event.button == LEFT_MOUSE) { // left mouse
        rubiksCube.selectCube(event.pageX, canvas.height - event.pageY);
        if (rubiksCube.selectedCube) {
            init_coordinates = screenToObjectCoordinates(event.pageX, canvas.height - event.pageY);
            setTimeout(function() {
                leftMouseDown = true;
            }, 50);
        }
    } else if (event.button == RIGHT_MOUSE) { // right mouse
        rightMouseDown = true;
        x_init_right = event.pageX;
        y_init_right = event.pageY;
    }
}

function endRotate(event) {
    if (event.button == LEFT_MOUSE && leftMouseDown) { // left mouse
        leftMouseDown = false;
    } else if (event.button == RIGHT_MOUSE) { // right mouse
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
