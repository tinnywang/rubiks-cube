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
var initIntersection;
var newIntersection;
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
    this.boundingBox = new BoundingBox(projectionMatrix, modelViewMatrix, EYE);

    this.init = function() {
        this.initCubeBuffers();

        for (let r = 0; r < 3; r++) {
            this.cubes[r] = new Array(3);
            for (let g = 0; g < 3; g++) {
                this.cubes[r][g] = new Array(3);
                for (let b = 0; b < 3; b++) {
                    // Each cube has dimensions 2x2x2 units.
                    const coordinates = glMatrix.vec3.fromValues(2 * (r - 1), 2 * (g - 1), 2 * (b - 1));
                    const cube = new Cube(this, coordinates, data);
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
        const buffer = new Array();
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
        gl.uniform1i(shaderProgram.lighting, 1);

        glMatrix.mat4.perspective(projectionMatrix, FOV, canvas.width / canvas.height, Z_NEAR, Z_FAR);
        glMatrix.mat4.multiply(modelViewMatrix, VIEW_MATRIX, rotationMatrix);
        for (let r = 0; r < 3; r++) {
            for (let g = 0; g < 3; g++) {
                for (let b = 0; b < 3; b++) {
                    const cube = this.cubes[r][g][b];
                    cube.draw();
                }
            }
        }
    }

    /*
     * Sets this.rotatedCubes to an array of cubes that are in the same plane as initCube, newCube, and axis.
     */
    this.setRotatedCubes = function(initIntersection, newIntersection, axis) {
        if (!initIntersection || !newIntersection || !axis) {
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

        const initCoordinate = initIntersection.point[i];
        const newCoordinate = newIntersection.point[i];
        const cubes = [];
        for (let r = 0; r < 3; r++) {
            for (let g = 0; g < 3; g++) {
                for (let b = 0; b < 3; b++) {
                    const c = this.cubes[r][g][b];
                    const coordinate = c.coordinates[i];
                    if (inRange(initCoordinate, coordinate, 1) && inRange(newCoordinate, coordinate, 1)) {
                        cubes.push(c);
                    }
                }
            }
        }

        if (cubes.length == 9) {
            this.rotatedCubes = cubes;
        }
    }

    function inRange(value, origin, delta) {
        const lower = origin - delta;
        const upper = origin + delta;
        return lower < value && value < upper;
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
        const newRotationMatrix = glMatrix.mat4.create();
        glMatrix.mat4.fromRotation(newRotationMatrix, glMatrix.glMatrix.toRadian(DEGREES), this.rotationAxis);

        for (let cube of this.rotatedCubes) {
            cube.rotate(newRotationMatrix);
        }
    }

    this.select = function(x, y) {
        return rubiksCube.boundingBox.intersection(event.pageX - canvasXOffset, event.pageY - canvasYOffset);
    }

    this.setRotationAxis = function(initIntersection, newIntersection) {
        if (!initIntersection || !newIntersection) {
            return;
        }

        const axis = glMatrix.vec3.create();

        // The selected stickers are on the same face of the Rubik's cube.
        if (glMatrix.vec3.equals(initIntersection.normal, newIntersection.normal)) {
            const direction = glMatrix.vec3.create();
            glMatrix.vec3.subtract(direction, newIntersection.point, initIntersection.point);
            glMatrix.vec3.cross(axis, initIntersection.normal, direction);
        } else {
            glMatrix.vec3.cross(axis, initIntersection.normal, newIntersection.normal);
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
            const cube = this.randomCube();
            const i = Math.floor(Math.random() * 3);
            const initIntersection = cube.stickers[i];
            const newIntersection = cube.stickers[(i + 1) % 2];
            this.setRotationAxis(initIntersection, newIntersection);
            this.setRotatedCubes(initIntersection, newIntersection, this.rotationAxis);
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
    this.data = data;
    this.rotationMatrix = glMatrix.mat4.create();
    this.coordinates = coordinates;

    this.rotate = function(newRotationMatrix) {
        glMatrix.mat4.multiply(this.rotationMatrix, newRotationMatrix, this.rotationMatrix);
        glMatrix.vec3.transformMat4(this.coordinates, this.coordinates, newRotationMatrix);
   }

    this.transform = function() {
        glMatrix.mat4.translate(modelViewMatrix, modelViewMatrix, this.coordinates);
        glMatrix.mat4.multiply(modelViewMatrix, modelViewMatrix, this.rotationMatrix);
    }

    this.draw = function() {
        const mvMatrix = glMatrix.mat4.create();
        glMatrix.mat4.copy(mvMatrix, modelViewMatrix);
        this.transform();
        setMatrixUniforms();

        let offset = 0;
        for (let faceGroup of this.data.faces) {
            const material = faceGroup.material;
            // Blender doesn't seem to support per-object ambient colors or export the global ambient color,
            // so we compute our own ambient color as a darker version of the diffuse color.
            const ambient = glMatrix.vec3.create();
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
    const shaderScript = document.getElementById(id);
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
    const fragmentShader = getShader(gl, 'fragmentShader');
    const vertexShader = getShader(gl, 'vertexShader');
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
    if (gl) {
        initShaders();
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        rubiksCube = new RubiksCube(data);
        perspectiveView();
        drawScene();
    }
}

function setMatrixUniforms() {
    const projectionUniform = gl.getUniformLocation(shaderProgram, 'projectionMatrix');
    gl.uniformMatrix4fv(projectionUniform, false, projectionMatrix);

    const modelViewUniform = gl.getUniformLocation(shaderProgram, 'modelViewMatrix');
    gl.uniformMatrix4fv(modelViewUniform, false, modelViewMatrix);

    const normalMatrix = glMatrix.mat4.create();
    glMatrix.mat4.invert(normalMatrix, modelViewMatrix);
    glMatrix.mat4.transpose(normalMatrix, normalMatrix);
    const normalMatrix3 = glMatrix.mat3.create();
    glMatrix.mat3.fromMat4(normalMatrix3, normalMatrix);
    const normalMatrixUniform = gl.getUniformLocation(shaderProgram, 'normalMatrix');
    gl.uniformMatrix3fv(normalMatrixUniform, false, normalMatrix3);
}

function rotate(event) {
    if (rightMouseDown) {
        xNewRight = event.pageX;
        yNewRight = event.pageY;
        const delta_x = (xNewRight - xInitRight) / 50;
        const delta_y = (yNewRight - yInitRight) / 50;
        const axis = [delta_y, delta_x, 0];
        const degrees = Math.sqrt(delta_x * delta_x + delta_y * delta_y);
        const newRotationMatrix = glMatrix.mat4.create();
        glMatrix.mat4.fromRotation(newRotationMatrix, glMatrix.glMatrix.toRadian(degrees), axis);
        glMatrix.mat4.multiply(rotationMatrix, newRotationMatrix, rotationMatrix);
    }
}

function startRotate(event) {
    if (isLeftMouse(event)) {
        initIntersection = rubiksCube.select(event.pageX, event.pageY);
        if (initIntersection) {
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
        newIntersection = rubiksCube.select(event.pageX, event.pageY);
        if (newIntersection) {
            rubiksCube.setRotationAxis(initIntersection, newIntersection);
            rubiksCube.setRotatedCubes(initIntersection, newIntersection, rubiksCube.rotationAxis);
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
