const EYE = [0, 0, 20];
const CENTER = [0, 0, 0];
const UP = [0, 1, 0];
const LIGHTS = [
    {
        position: [35, 20, 10],
        intensity: 1,
    },
    {
        position: [0, -10, 0],
        intensity: 1,
    },
];
const VIEW_MATRIX = glMatrix.mat4.lookAt(glMatrix.mat4.create(), EYE, CENTER, UP);
const DEGREES = 5;
const MARGIN_OF_ERROR = 1e-3;
const FOV = glMatrix.glMatrix.toRadian(70);
const Z_NEAR = 1;
const Z_FAR = 100;
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

function RubiksCube(data) {
    this.data = data;
    this.rotatedCubes = null; // an array of Cubes
    this.rotationAxis = null; // a vec3
    this.rotationAngle = 0;
    this.scrambleCycles = 0;
    this.cubeVerticesBuffer = null;
    this.cubeNormalsBuffer = null;
    this.cubeFacesBuffer = null;
    this.cubes = new Array(3);

    this.init = function() {
        this.initCubeBuffers();

        for (let r = 0; r < 3; r++) {
            this.cubes[r] = new Array(3);
            for (let g = 0; g < 3; g++) {
                this.cubes[r][g] = new Array(3);
                for (let b = 0; b < 3; b++) {
                    let coordinates = [r - 1, g - 1, b - 1];
                    let cube = new Cube(this, coordinates, data);
                    this.cubes[r][g][b] = cube;
                }
            }
        }
    }

    this.initCubeBuffers = function() {
        // vertices
        this.cubeVerticesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVerticesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data.vertices), gl.STATIC_DRAW);
        // normals
        this.cubeNormalsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeNormalsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data.normals), gl.STATIC_DRAW);
        // faces
        let buffer = new Array();
        for (let faceGroup of data.faces) {
           buffer.push(...faceGroup.vertex_indices);
        }
        this.cubeFacesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeFacesBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(buffer), gl.STATIC_DRAW);
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
                }
            }
        }
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
        return null;
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

function Cube(rubiksCube, coordinates, data) {
    this.rubiksCube = rubiksCube;
    this.coordinates = coordinates;
    this.data = data;
    this.rotationMatrix = glMatrix.mat4.create();
    this.translationVector = glMatrix.vec3.create();

    this.init = function() {
        glMatrix.vec3.scale(this.translationVector, this.coordinates, 2);
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

        let offset = 0;
        for (let faceGroup of this.data.faces) {
            let material = faceGroup.material;
            // Blender doesn't seem to support per-object ambient colors or export the global ambient color,
            // so we compute our own ambient color as a darker version of the diffuse color.
            let ambient = glMatrix.vec3.create();
            glMatrix.vec3.scale(ambient, material.diffuse, 0.4);
            gl.uniform3fv(shaderProgram.ambient, ambient);
            gl.uniform3fv(shaderProgram.diffuse, material.diffuse);
            gl.uniform3fv(shaderProgram.specular, material.specular);
            gl.uniform1f(shaderProgram.specularExponent, material.specular_exponent);
            // vertices
            gl.bindBuffer(gl.ARRAY_BUFFER, rubiksCube.cubeVerticesBuffer);
            gl.vertexAttribPointer(shaderProgram.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            // normals
            gl.bindBuffer(gl.ARRAY_BUFFER, rubiksCube.cubeNormalsBuffer);
            gl.vertexAttribPointer(shaderProgram.vertexNormal, 3, gl.FLOAT, false, 0, 0);
            // faces
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rubiksCube.cubeFacesBuffer);
            gl.drawElements(gl.TRIANGLES, faceGroup.vertex_indices.length, gl.UNSIGNED_SHORT, offset);

            // Offset must be a multiple of the size of the array buffer's type,
            // and an unsigned short is 2 bytes.
            offset += faceGroup.vertex_indices.length * 2;
        }

        glMatrix.mat4.copy(modelViewMatrix, mvMatrix);
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

    shaderProgram.eye = gl.getUniformLocation(shaderProgram, 'eye');
    gl.uniform3fv(shaderProgram.eye, EYE);

    for (let i = 0; i < LIGHTS.length; i++) {
        const lightPosition = `lights[${i}].position`;
        const lightIntensity = `lights[${i}].intensity`;
        shaderProgram[lightPosition] = gl.getUniformLocation(shaderProgram, lightPosition);
        shaderProgram[lightIntensity] = gl.getUniformLocation(shaderProgram, lightIntensity);
        gl.uniform3fv(shaderProgram[lightPosition], LIGHTS[i].position);
        gl.uniform1f(shaderProgram[lightIntensity], LIGHTS[i].intensity);
    }

    shaderProgram.lighting = gl.getUniformLocation(shaderProgram, 'lighting');
    shaderProgram.ambient = gl.getUniformLocation(shaderProgram, 'ambient');
    shaderProgram.diffuse = gl.getUniformLocation(shaderProgram, 'diffuse');
    shaderProgram.specular = gl.getUniformLocation(shaderProgram, 'specular');
    shaderProgram.specularExponent = gl.getUniformLocation(shaderProgram, 'specularExponent');
}

function drawScene() {
    if (isRotating) {
        rubiksCube.rotateLayer();
    }

    rubiksCube.draw();

    requestAnimationFrame(drawScene);
}

function start(data) {
    canvas = document.getElementById('glcanvas');
    canvasXOffset = $('#glcanvas').offset()['left'];
    canvasYOffset = $('#glcanvas').offset()['top'];
    gl = initWebGL(canvas);
    initShaders();
    rubiksCube = new RubiksCube(data);
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
        let axis = [delta_y, delta_x, 0];
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
    glMatrix.mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.glMatrix.toRadian(45));
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
    $.get('/models/rubiks-cube.json', function(data) {
        start(data[0]);
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
});
