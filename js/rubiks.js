const EYE = [0, 0, -20];
const CENTER = [0, 0, 0];
const UP = [0, 1, 0];
const VIEW_MATRIX = glMatrix.mat4.lookAt(glMatrix.mat4.create(), EYE, CENTER, UP);
const DEGREES = 5;
const MARGIN_OF_ERROR = 1e-3;
const FOV = glMatrix.glMatrix.toRadian(-70);
const Z_NEAR = 1;
const Z_FAR = 100;
const STICKER_DEPTH = 0.96;
const STICKER_SCALE = 0.85; // a sticker covers 85% of a cube's face
const LEFT_MOUSE = 0;
const RIGHT_MOUSE = 2;

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
var initSticker;
var newSticker;
var isRotating = false;
var isScrambling = false;

var modelViewMatrix = glMatrix.mat4.create();
var projectionMatrix = glMatrix.mat4.create();
var rotationMatrix = glMatrix.mat4.create();

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

        for (let r = 0; r < 3; r++) {
            this.cubes[r] = new Array(3);
            for (let g = 0; g < 3; g++) {
                this.cubes[r][g] = new Array(3);
                for (let b = 0; b < 3; b++) {
                    let coordinates = [r - 1, g - 1, b - 1];
                    let cube = new Cube(this, coordinates);
                    this.cubes[r][g][b] = cube;

                    for (let sticker of cube.stickers) {
                        // Transform rgba values from floats in [0, 1] to ints in [0, 255].
                        let color = glMatrix.vec4.clone(sticker.pickingColor);
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

        glMatrix.mat4.perspective(projectionMatrix, FOV, canvas.width / canvas.height, Z_NEAR, Z_FAR);
        glMatrix.mat4.copy(modelViewMatrix, VIEW_MATRIX);
        glMatrix.mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);

        for (let r = 0; r < 3; r++) {
            for (let g = 0; g < 3; g++) {
                for (let b = 0; b < 3; b++) {
                    let cube = this.cubes[r][g][b];
                    cube.draw();
                    for (let sticker of cube.stickers) {
                        sticker.draw(sticker.color, STICKER_SCALE);
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

        glMatrix.mat4.perspective(projectionMatrix, FOV, canvas.width / canvas.height, Z_NEAR, Z_FAR);
        glMatrix.mat4.copy(modelViewMatrix, VIEW_MATRIX);
        glMatrix.mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);

        for (let r = 0; r < 3; r++) {
            for (let g = 0; g < 3; g++) {
                for (let b = 0; b < 3; b++) {
                    let cube = this.cubes[r][g][b];
                    for (let sticker of cube.stickers) {
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
    this.setRotatedCubes = function(initSticker, newSticker, axis) {
        if (!initSticker || !newSticker || !axis) {
            return;
        }
        this.rotatedCubes = null;

        if (!axis) {
            return;
        }

        for (var i = 0; i < axis.length; i++) {
            if (axis[i] != 0) {
                break;
            }
        }

        let initCoordinate = initSticker.cube.coordinates[i];
        let newCoordinate = newSticker.cube.coordinates[i];
        if (Math.abs(newCoordinate - initCoordinate) > MARGIN_OF_ERROR) {
            return;
        }

        let cubes = [];
        for (let r = 0; r < 3; r++) {
            for (let g = 0; g < 3; g++) {
                for (let b = 0; b < 3; b++) {
                    let c = this.cubes[r][g][b];
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
        if (!this.rotationAxis) {
            return;
        }

        if (Math.abs(this.rotationAngle) == 90) {
            this.rotationAngle = 0;
            isRotating = false;
            this.scramble();
            return;
        }

        this.rotationAngle += DEGREES;
        let newRotationMatrix = glMatrix.mat4.create();
        glMatrix.mat4.fromRotation(newRotationMatrix, glMatrix.glMatrix.toRadian(DEGREES), this.rotationAxis);

        for (let cube of this.rotatedCubes) {
            glMatrix.vec3.transformMat4(cube.coordinates, cube.coordinates, newRotationMatrix);
            glMatrix.mat4.multiply(cube.rotationMatrix, newRotationMatrix, cube.rotationMatrix);

            for (let sticker of cube.stickers) {
                glMatrix.vec3.transformMat4(sticker.normal, sticker.normal, newRotationMatrix);
                glMatrix.vec3.normalize(sticker.normal, sticker.normal)
            }
        }
    }

    this.select = function(x, y) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
        let pixelValues = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelValues);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return this.stickers.get(pixelValues.toString());
    }

    this.setRotationAxis = function(initSticker, newSticker) {
        if (!initSticker || !newSticker) {
            return;
        }

        let axis = glMatrix.vec3.create();
        let initCoordinates = initSticker.cube.coordinates;
        let newCoordinates = newSticker.cube.coordinates;

        // The selected stickers are on the same face of the Rubik's cube.
        if (glMatrix.vec3.equals(initSticker.normal, newSticker.normal)) {
            let direction = glMatrix.vec3.create();
            glMatrix.vec3.subtract(direction, newCoordinates, initCoordinates);
            glMatrix.vec3.cross(axis, initSticker.normal, direction);
        } else {
            glMatrix.vec3.cross(axis, initSticker.normal, newSticker.normal);
        }

        glMatrix.vec3.normalize(axis, axis);
        glMatrix.vec3.round(axis, axis);

        this.rotationAxis = glMatrix.vec3.length(axis) == 1 ? axis : null;
    }

    this.scramble = function() {
        if (this.scrambleCycles == 0) {
            isRotating = false;
            isScrambling = false;
        } else {
            let cube = this.randomCube();
            let i = Math.floor(Math.random() * 3);
            let initSticker = cube.stickers[i];
            let newSticker = cube.stickers[(i + 1) % 2];
            this.setRotationAxis(initSticker, newSticker);
            this.setRotatedCubes(initSticker, newSticker, this.rotationAxis);
            isRotating = true;
            this.scrambleCycles--;
        }
    }

    this.randomCube = function() {
        let r, g, b;
        do {
            r = Math.floor(Math.random() * 3);
            g = Math.floor(Math.random() * 3);
            b = Math.floor(Math.random() * 3);
        } while (r == 0 && g == 0 && b == 0)
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
        let x = this.coordinates[0];
        let y = this.coordinates[1];
        let z = this.coordinates[2];
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
        let mvMatrix = glMatrix.mat4.create();
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
        let mask = 0xFF;
        let hash = this.hashCode();
        let color = [hash & mask, (hash >> 8) & mask, (hash >> 16) & mask];
        color = [color[0]/mask, color[1]/mask, color[2]/mask, 1];
        this.pickingColor = color;
    }

    // https://stackoverflow.com/a/7616484
    this.hashCode = function() {
        let hash = 0;
        let s = this.cube.coordinates + ':' + this.color + ':' + this.normal;

        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    this.draw = function(color, scale) {
        let mvMatrix = glMatrix.mat4.create();
        glMatrix.mat4.copy(mvMatrix, modelViewMatrix)
        this.transform();
        if (scale) {
          glMatrix.mat4.scale(
            modelViewMatrix,
            modelViewMatrix,
            glMatrix.vec3.fromValues(scale, scale, scale)
          );
        }
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
    let shaderScript = document.getElementById(id);
    if (!shaderScript) {
        return null;
    }
    let source = '';
    let currentChild = shaderScript.firstChild;
    while (currentChild) {
        if (currentChild.nodeType == currentChild.TEXT_NODE) {
            source += currentChild.textContent;
        }
        currentChild = currentChild.nextSibling;
    }
    let shader;
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
    let fragmentShader = getShader(gl, 'fragmentShader');
    let vertexShader = getShader(gl, 'vertexShader');
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

    requestAnimationFrame(drawScene);
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
        drawScene();
    }
}

function setMatrixUniforms() {
    let projectionUniform = gl.getUniformLocation(shaderProgram, 'projectionMatrix');
    gl.uniformMatrix4fv(projectionUniform, false, projectionMatrix);

    let modelViewUniform = gl.getUniformLocation(shaderProgram, 'modelViewMatrix');
    gl.uniformMatrix4fv(modelViewUniform, false, modelViewMatrix);

    let normalMatrix = glMatrix.mat4.create();
    glMatrix.mat4.invert(normalMatrix, modelViewMatrix);
    glMatrix.mat4.transpose(normalMatrix, normalMatrix);
    let normalMatrix3 = glMatrix.mat3.create();
    glMatrix.mat3.fromMat4(normalMatrix3, normalMatrix);
    let normalMatrixUniform = gl.getUniformLocation(shaderProgram, 'normalMatrix');
    gl.uniformMatrix3fv(normalMatrixUniform, false, normalMatrix3);
}

function rotate(event) {
    if (rightMouseDown) {
        xNewRight = event.pageX;
        yNewRight = event.pageY;
        let delta_x = (xNewRight - xInitRight) / 50;
        let delta_y = (yNewRight - yInitRight) / 50;
        let axis = [delta_y, -delta_x, 0];
        let degrees = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
        let newRotationMatrix = glMatrix.mat4.create();
        glMatrix.mat4.fromRotation(newRotationMatrix, glMatrix.glMatrix.toRadian(degrees), axis);
        glMatrix.mat4.multiply(rotationMatrix, newRotationMatrix, rotationMatrix);
    }
}

function startRotate(event) {
    if (isLeftMouse(event)) {
        initSticker = rubiksCube.select(event.pageX - canvasXOffset, canvas.height - event.pageY + canvasYOffset);
        if (initSticker) {
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
        let x = event.pageX - canvasXOffset;
        let y = canvas.height - event.pageY + canvasYOffset;
        newSticker = rubiksCube.select(x, y);
        if (newSticker) {
            rubiksCube.setRotationAxis(initSticker, newSticker);
            rubiksCube.setRotatedCubes(initSticker, newSticker, rubiksCube.rotationAxis);
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
    glMatrix.mat4.rotateX(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(30));
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
