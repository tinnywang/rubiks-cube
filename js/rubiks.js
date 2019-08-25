var canvas;
var canvasXOffset;
var canvasYOffset;
var gl;
var rubiksCube;
var shaderProgram;

var rightMouseDown = false;
var xInitRight;
var yInitRight;
var xNewRight;
var yNewRight;
var leftMouseDown = false;
var initCoordinates;
var newCoordinates;
var initCube;
var newCube;
var isRotating = false;
var isScrambling = false;

var modelViewMatrix = glMatrix.mat4.create();
var projectionMatrix = glMatrix.mat4.create();
var rotationMatrix = glMatrix.mat4.create();

const EYE = [0, 0, -20];
const CENTER = [0, 0, 0];
const UP = [0, 1, 0];
const DEGREES = 5;
const MARGIN_OF_ERROR = 1e-3;
const FOV = -45;
const STICKER_DEPTH = 0.96;
const LEFT_MOUSE = 0;
const RIGHT_MOUSE = 2;

function RubiksCube() {
    this.rotatedCubes = null; // an array of Cubes
    this.rotationAxis = null; // a vec3
    this.rotationAngle = 0;
    this.scrambleCycles = 0;
    this.cubeVerticesBuffer = null;
    this.cubeNormalsBuffer = null;
    this.cubeFacesBuffer = null;
    this.stickerVerticesBuffer = null;
    this.stickerNormalsBuffer = null;
    this.stickerFacesBuffer = null;
    this.pickingFramebuffer = null;
    this.pickingTexture = null;
    this.pickingRenderBuffer = null;
    this.cubes = new Array(3);
    this.stickers = new Map(); // Map from rgba picking color to sticker.

    this.init = function() {
        this.initTextureFramebuffer();
        this.initCubeBuffers();
        this.initStickerBuffers();

        for (var r = 0; r < 3; r++) {
            this.cubes[r] = new Array(3);
            for (var g = 0; g < 3; g++) {
                this.cubes[r][g] = new Array(3);
                for (var b = 0; b < 3; b++) {
                    var coordinates = [r - 1, g - 1, b - 1];
                    var cube = new Cube(this, coordinates);
                    this.cubes[r][g][b] = cube;

                    for (var sticker of cube.stickers) {
                        var color = glMatrix.vec4.clone(sticker.pickingColor);
                        glMatrix.vec4.scale(color, color, 255);
                        this.stickers.set(color.toString(), sticker);
                    }
                }
            }
        }
    }

    this.initTextureFramebuffer = function() {
        this.pickingFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);

        this.pickingTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.pickingTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        this.pickingRenderBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickingRenderBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickingTexture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickingRenderBuffer);
    }

    this.initCubeBuffers = function() {
        // vertices
        this.cubeVerticesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVerticesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeModel.vertices), gl.STATIC_DRAW);
        // normals
        this.cubeNormalsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeNormalsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeModel.normals), gl.STATIC_DRAW);
        // faces
        this.cubeFacesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeFacesBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeModel.faces), gl.STATIC_DRAW);
    }

    this.initStickerBuffers = function() {
        // vertices
        this.stickerVerticesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.stickerVerticesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stickerModel.vertices), gl.STATIC_DRAW);
        // normals
        this.stickerNormalsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.stickerNormalsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stickerModel.normals), gl.STATIC_DRAW);
        // faces
        this.stickerFacesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.stickerFacesBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(stickerModel.faces), gl.STATIC_DRAW);
    }

    this.init();

    this.draw = function() {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.uniform1i(shaderProgram.lighting, 1);

        glMatrix.mat4.perspective(projectionMatrix, FOV, canvas.width / canvas.height, 0.1, 100.0);
        glMatrix.mat4.lookAt(modelViewMatrix, EYE, CENTER, UP);
        glMatrix.mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);

        for (var r = 0; r < 3; r++) {
            for (var g = 0; g < 3; g++) {
                for (var b = 0; b < 3; b++) {
                    var cube = this.cubes[r][g][b];
                    cube.draw();
                    for (var sticker of cube.stickers) {
                        sticker.draw(sticker.color);
                    }
                }
            }
        }
    }

    this.drawToPickingFramebuffer = function() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, rubiksCube.pickingFramebuffer);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1i(shaderProgram.lighting, 0);

        glMatrix.mat4.perspective(projectionMatrix, FOV, canvas.width / canvas.height, 0.1, 100.0);
        glMatrix.mat4.lookAt(modelViewMatrix, EYE, CENTER, UP);
        glMatrix.mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);

        for (var r = 0; r < 3; r++) {
            for (var g = 0; g < 3; g++) {
                for (var b = 0; b < 3; b++) {
                    var cube = this.cubes[r][g][b];
                    for (var sticker of cube.stickers) {
                        sticker.draw(sticker.pickingColor);
                    }
                }
            }
        }

        gl.uniform1i(shaderProgram.lighting, 1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /*
     * Sets this.rotatedCubes to an array of cubes that are in the same plane as initCube, newCube, and axis.
     */
    this.setRotatedCubes = function(initCube, newCube, axis) {
        this.rotatedCubes = null;

        if (axis == null) {
            return;
        }

        var i = 0;
        for (; i < axis.length; i++) {
            if (axis[i] != 0) {
                break;
            }
        }

        var initCoordinate = initCube.coordinates[i];
        var newCoordinate = newCube.coordinates[i];
        if (Math.abs(newCoordinate - initCoordinate) > MARGIN_OF_ERROR) {
            return;
        }

        var cubes = [];
        for (var r = 0; r < 3; r++) {
            for (var g = 0; g < 3; g++) {
                for (var b = 0; b < 3; b++) {
                    var c = this.cubes[r][g][b];
                    if (Math.abs(c.coordinates[i] - initCoordinate) < MARGIN_OF_ERROR) {
                        cubes.push(c);
                    }
                }
            }
        }

        if (cubes.length == 9) {
            this.rotatedCubes = cubes;
        }
    }

    /*
     * Rotates this.rotatedCubes around this.rotationAxis by DEGREES.
     */
    this.rotateLayer = function() {
        if (Math.abs(this.rotationAngle) == 90) {
            this.rotationAngle = 0;
            isRotating = false;
            this.scramble();
            return;
        }

        this.rotationAngle += DEGREES;
        var newRotationMatrix = glMatrix.mat4.create();
        glMatrix.mat4.fromRotation(newRotationMatrix, glMatrix.glMatrix.toRadian(DEGREES), this.rotationAxis);

        for (var cube of this.rotatedCubes) {
            glMatrix.vec3.transformMat4(cube.coordinates, cube.coordinates, newRotationMatrix);
            glMatrix.mat4.multiply(cube.rotationMatrix, newRotationMatrix, cube.rotationMatrix);

            for (var sticker of cube.stickers) {
                glMatrix.vec3.transformMat4(sticker.normal, sticker.normal, newRotationMatrix);
                glMatrix.vec3.normalize(sticker.normal, sticker.normal)
            }
        }
    }

    this.select = function(x, y) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
        var pixelValues = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelValues);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return this.stickers.get(pixelValues.toString());
    }

    this.setRotationAxis = function(selected, direction) {
        if (!selected) {
            return;
        }
        var axis = glMatrix.vec3.create();
        glMatrix.vec3.cross(axis, selected.normal, direction);
        glMatrix.vec3.normalize(axis, axis);
        glMatrix.vec3.round(axis, axis);

        this.rotationAxis = glMatrix.vec3.length(axis) == 1 ? axis : null;
    }

    this.scramble = function() {
        if (this.scrambleCycles == 0) {
            isRotating = false;
            isScrambling = false;
        } else {
            var axis = glMatrix.vec3.create();
            var i = Math.floor(Math.random() * 3)
            axis[i] = Math.random < 0.5 ? 1 : -1;
            this.rotationAxis = axis;

            cube = this.randomCube();
            this.setRotatedCubes(cube, cube, this.rotationAxis);
            isRotating = true;
            this.scrambleCycles--;
        }
    }

    this.randomCube = function() {
        var r = Math.floor(Math.random() * 3)
        var g = Math.floor(Math.random() * 3)
        var b = Math.floor(Math.random() * 3)
        return this.cubes[r][g][b];
    }
}

function Cube(rubiksCube, coordinates) {
    this.rubiksCube = rubiksCube;
    this.coordinates = coordinates;
    this.rotationMatrix = glMatrix.mat4.create();
    this.translationVector = glMatrix.vec3.create();
    this.stickers = [];
    this.COLORS = {
        'blue': [0.0, 0.0, 1.0, 1.0],
        'green': [0.0, 1.0, 0.0, 1.0],
        'orange': [1.0, 0.5, 0.0, 1.0],
        'red': [1.0, 0.0, 0.0, 1.0],
        'white': [1.0, 1.0, 1.0, 1.0],
        'yellow': [1.0, 1.0, 0.0, 1.0]
    }

    this.init = function() {
        glMatrix.vec3.scale(this.translationVector, this.coordinates, 2);
        this.initStickers();
    }

    this.initStickers = function() {
        var x = this.coordinates[0];
        var y = this.coordinates[1];
        var z = this.coordinates[2];
        if (x == -1) {
            this.stickers.push(new Sticker(this, this.COLORS['red'], [-1, 0, 0], function() {
                this.cube.transform();
                glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, [-STICKER_DEPTH, 0, 0]);
                glMatrix.mat4.rotateZ(modelViewMatrix, modelViewMatrix, glMatrix.glMatrix.toRadian(90));
            }));
        } else if (x == 1) {
            this.stickers.push(new Sticker(this, this.COLORS['orange'], [1, 0, 0], function() {
                this.cube.transform();
                glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, [STICKER_DEPTH, 0, 0]);
                glMatrix.mat4.rotateZ(modelViewMatrix, modelViewMatrix, glMatrix.glMatrix.toRadian(-90));
            }));
        }
        if (y == -1) {
            this.stickers.push(new Sticker(this, this.COLORS['yellow'], [0, -1, 0], function() {
                this.cube.transform();
                glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, [0, -STICKER_DEPTH, 0]);
                glMatrix.mat4.rotateX(modelViewMatrix, modelViewMatrix, glMatrix.glMatrix.toRadian(-180));
            }));
        } else if (y == 1) {
            this.stickers.push(new Sticker(this, this.COLORS['white'], [0, 1, 0], function() {
                this.cube.transform();
                glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, [0, STICKER_DEPTH, 0]);
                setMatrixUniforms();
            }));
        }
        if (z == 1) {
            this.stickers.push(new Sticker(this, this.COLORS['green'], [0, 0, 1], function() {
                this.cube.transform();
                glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, STICKER_DEPTH]);
                glMatrix.mat4.rotateX(modelViewMatrix, modelViewMatrix, glMatrix.glMatrix.toRadian(90));
            }));
        } else if (z == -1) {
            this.stickers.push(new Sticker(this, this.COLORS['blue'], [0, 0, -1], function() {
                this.cube.transform();
                glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0, -STICKER_DEPTH]);
                glMatrix.mat4.rotateX(modelViewMatrix, modelViewMatrix, glMatrix.glMatrix.toRadian(-90));
            }));
        }
    }

    this.init();

    this.transform = function() {
        glMatrix.mat4.multiply(modelViewMatrix, modelViewMatrix, this.rotationMatrix);
        glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, this.translationVector);
    }

    this.draw = function() {
        var mvMatrix = glMatrix.mat4.create();
        glMatrix.mat4.copy(mvMatrix, modelViewMatrix);
        this.transform();
        setMatrixUniforms();

        gl.uniform4fv(shaderProgram.ambient, cubeModel.ambient);
        gl.uniform4fv(shaderProgram.diffuse, cubeModel.diffuse);
        gl.uniform4fv(shaderProgram.specular, cubeModel.specular);
        gl.uniform1f(shaderProgram.shininess, cubeModel.shininess);
        // vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, rubiksCube.cubeVerticesBuffer);
        gl.vertexAttribPointer(shaderProgram.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        // normals
        gl.bindBuffer(gl.ARRAY_BUFFER, rubiksCube.cubeNormalsBuffer);
        gl.vertexAttribPointer(shaderProgram.vertexNormal, 3, gl.FLOAT, false, 0, 0);
        // faces
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rubiksCube.cubeFacesBuffer);
        gl.drawElements(gl.TRIANGLES, cubeModel.faces.length, gl.UNSIGNED_SHORT, 0);

        glMatrix.mat4.copy(modelViewMatrix, mvMatrix);
    }
}

function Sticker(cube, color, normal, transform) {
    this.cube = cube;
    this.color = color;
    this.normal = normal;
    this.transform = transform;
    this.pickingColor = null;

    this.init = function() {
        var mask = 0xFF;
        var hash = this.hashCode();
        var color = [hash & mask, (hash >> 8) & mask, (hash >> 16) & mask];
        color = [color[0]/mask, color[1]/mask, color[2]/mask, 1];
        this.pickingColor = color;
    }

    // https://stackoverflow.com/a/7616484
    this.hashCode = function() {
        var hash = 0;
        var s = this.cube.coordinates + ':' + this.color + ':' + this.normal;

        for (var i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    this.draw = function(color) {
        var mvMatrix = glMatrix.mat4.create();
        glMatrix.mat4.copy(mvMatrix, modelViewMatrix)
        this.transform();
        setMatrixUniforms();

        gl.uniform4fv(shaderProgram.ambient, color);
        gl.uniform4fv(shaderProgram.diffuse, stickerModel.diffuse);
        gl.uniform4fv(shaderProgram.specular, stickerModel.specular);
        gl.uniform1f(shaderProgram.shininess, stickerModel.shininess);
        // vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, cube.rubiksCube.stickerVerticesBuffer);
        gl.vertexAttribPointer(shaderProgram.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        // normals
        gl.bindBuffer(gl.ARRAY_BUFFER, cube.rubiksCube.stickerNormalsBuffer);
        gl.vertexAttribPointer(shaderProgram.vertexNormal, 3, gl.FLOAT, false, 0, 0);
        // faces
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cube.rubiksCube.stickerFacesBuffer);
        gl.drawElements(gl.TRIANGLES, stickerModel.faces.length, gl.UNSIGNED_SHORT, 0);

        glMatrix.mat4.copy(modelViewMatrix, mvMatrix);
    }

    this.init();
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
    shaderProgram.vertexPosition = gl.getAttribLocation(shaderProgram, 'vertexPosition');
    gl.enableVertexAttribArray(shaderProgram.vertexPosition);
    shaderProgram.vertexNormal = gl.getAttribLocation(shaderProgram, 'vertexNormal');
    gl.enableVertexAttribArray(shaderProgram.vertexNormal);
    shaderProgram.eyePosition = gl.getUniformLocation(shaderProgram, 'eyePosition');
    gl.uniform3fv(shaderProgram.eyePosition, EYE);
    shaderProgram.lighting = gl.getUniformLocation(shaderProgram, 'lighting');
    shaderProgram.ambient = gl.getUniformLocation(shaderProgram, 'ambient');
    shaderProgram.diffuse = gl.getUniformLocation(shaderProgram, 'diffuse');
    shaderProgram.specular = gl.getUniformLocation(shaderProgram, 'specular');
    shaderProgram.shininess = gl.getUniformLocation(shaderProgram, 'shininess');
}

function drawScene() {
    if (isRotating) {
        rubiksCube.rotateLayer();
    }

    rubiksCube.drawToPickingFramebuffer();
    rubiksCube.draw();
}

function tick() {
    requestAnimationFrame(tick);
    drawScene();
}

function start() {
    canvas = document.getElementById('glcanvas');
    canvasXOffset = $('#glcanvas').offset()['left'];
    canvasYOffset = $('#glcanvas').offset()['top'];
    gl = initWebGL(canvas);
    initShaders();
    rubiksCube = new RubiksCube();
    perspectiveView();

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

    var normalMatrix = glMatrix.mat4.create();
    glMatrix.mat4.invert(normalMatrix, modelViewMatrix);
    glMatrix.mat4.transpose(normalMatrix, normalMatrix);
    var normalMatrix3 = glMatrix.mat3.create();
    glMatrix.mat3.fromMat4(normalMatrix3, normalMatrix);
    var normalMatrixUniform = gl.getUniformLocation(shaderProgram, 'normalMatrix');
    gl.uniformMatrix3fv(normalMatrixUniform, false, normalMatrix3);
}

function unproject(dest, vec, view, proj, viewport) {
    var v = glMatrix.vec4.fromValues(
        (vec[0] - viewport[0]) * 2.0 / viewport[2] - 1.0,
        (vec[1] - viewport[1]) * 2.0 / viewport[3] - 1.0,
        2.0 * vec[2] - 1.0,
        1.0
    );

    var m = glMatrix.mat4.create();
    glMatrix.mat4.multiply(m, proj, view);
    glMatrix.mat4.invert(m, m);

    glMatrix.vec4.transformMat4(v, v, m);
    if (v[3] == 0.0) {
        return null;
    }

    return glMatrix.vec3.set(dest, v[0] / v[3], v[1] / v[3], v[2] / v[3]);
}

function screenToObjectCoordinates(x, y) {
    var screenCoordinates = [x, y, 0];
    var objectCoordinates = glMatrix.vec3.create();
    unproject(objectCoordinates, screenCoordinates, modelViewMatrix, projectionMatrix, [0, 0, canvas.width, canvas.height])
    return objectCoordinates
}

function rotate(event) {
    if (rightMouseDown) {
        xNewRight = event.pageX;
        yNewRight = event.pageY;
        var delta_x = (xNewRight - xInitRight) / 50;
        var delta_y = (yNewRight - yInitRight) / 50;
        var axis = [delta_y, -delta_x, 0];
        var degrees = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
        var newRotationMatrix = glMatrix.mat4.create();
        glMatrix.mat4.fromRotation(newRotationMatrix, glMatrix.glMatrix.toRadian(degrees), axis);
        glMatrix.mat4.multiply(rotationMatrix, newRotationMatrix, rotationMatrix);
    }
}

function startRotate(event) {
    if (isLeftMouse(event)) {
        var selected = rubiksCube.select(event.pageX - canvasXOffset, canvas.height - event.pageY + canvasYOffset);
        if (selected) {
            initCube = selected.cube;
            leftMouseDown = true;
        }
    } else if (isRightMouse(event)) {
        rightMouseDown = true;
        xInitRight = event.pageX;
        yInitRight = event.pageY;
    }
}

function endRotate(event) {
    if (leftMouseDown) {
        leftMouseDown = false;
        var x = event.pageX - canvasXOffset;
        var y = canvas.height - event.pageY + canvasYOffset;
        var selected = rubiksCube.select(x, y);
        if (selected) {
            newCube = selected.cube;
            var direction = glMatrix.vec3.create();
            glMatrix.vec3.subtract(direction, newCube.coordinates, initCube.coordinates);
            rubiksCube.setRotationAxis(selected, direction);
            rubiksCube.setRotatedCubes(initCube, newCube, rubiksCube.rotationAxis);
            isRotating = !!(rubiksCube.rotatedCubes && rubiksCube.rotationAxis);
        }
    }
    rightMouseDown = false;
}

function isLeftMouse(event) {
    return event.button == LEFT_MOUSE && !event.ctrlKey
}

function isRightMouse(event) {
    return (event.button == LEFT_MOUSE && event.ctrlKey) || event.button == RIGHT_MOUSE
}

function topView() {
    glMatrix.mat4.identity(rotationMatrix);
    glMatrix.mat4.rotateX(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(90));
}

function bottomView() {
    glMatrix.mat4.identity(rotationMatrix);
    glMatrix.mat4.rotateX(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(-90));
}

function leftView() {
    glMatrix.mat4.identity(rotationMatrix);
    glMatrix.mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(-90));
}

function rightView() {
    glMatrix.mat4.identity(rotationMatrix);
    glMatrix.mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(90));
}

function frontView() {
    glMatrix.mat4.identity(rotationMatrix);
    glMatrix.mat4.identity(rotationMatrix);
}

function backView() {
    glMatrix.mat4.identity(rotationMatrix);
    glMatrix.mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(180));
}

function perspectiveView() {
    glMatrix.mat4.identity(rotationMatrix);
    glMatrix.mat4.rotateX(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(45));
    glMatrix.mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(-45));
}

function togglePerspective(event) {
    switch(event.which) {
        case 32: // space
            perspectiveView();
            break;
        case 97: // a, left
            leftView();
            break;
        case 100: // d, right
            rightView();
            break;
        case 101: // e, top
            topView();
            break;
        case 113: // q, bottom
            bottomView();
            break;
        case 115: // s, back
            backView();
            break;
        case 119: // w, front
            frontView();
            break;
    }
}

function scramble() {
    if (!isScrambling) {
        isScrambling = true;
        rubiksCube.scrambleCycles = Math.ceil(Math.random() * 10 + 10); // an integer between 10 and 20
        rubiksCube.scramble();
    }
}

$(document).ready(function() {
    start();
    $('#glcanvas').bind('contextmenu', function(e) { return false; });
    $('#glcanvas').mousedown(startRotate);
    $('#glcanvas').mousemove(rotate);
    $('#glcanvas').mouseup(endRotate);
    $('#glcanvas').mouseout(endRotate);
    $('body').keypress(togglePerspective);
    $(window).resize(function() {
        canvasXOffset = $('#glcanvas').offset()['left'];
        canvasYOffset = $('#glcanvas').offset()['top'];
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    });
});
