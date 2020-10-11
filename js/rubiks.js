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
const FOV = glMatrix.glMatrix.toRadian(70);
const Z_NEAR = 1;
const Z_FAR = 100;
const LEFT_MOUSE = 0;
const RIGHT_MOUSE = 2;
const DEBOUNCE_TIMEOUT = 50;

var $canvas;
var gl;
var rubiksCube;
var shaderProgram;

var leftMouseDown = false;
var rightMouseDown = false;
var isScrambling = false;

var modelViewMatrix = glMatrix.mat4.create();
var projectionMatrix = glMatrix.mat4.create();
var rotationMatrix = glMatrix.mat4.create();

function RubiksCube(data) {
    this.data = data;
    this.buffers = null;
    this.rotation = null;
    this.scrambleCycles = 0;
    this.cubes = new Array(3);
    this.boundingBox = new BoundingBox(
        gl,
        projectionMatrix,
        modelViewMatrix,
        EYE,
    );

    this.init = function() {
        this.initBuffers();
        this.initRotation();

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

    this.initBuffers = function() {
        const vertices = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data.vertices), gl.STATIC_DRAW);

        const normals = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normals);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data.normals), gl.STATIC_DRAW);

        const buffer = new Array();
        for (let faceGroup of data.faces) {
           buffer.push(...faceGroup.vertex_indices);
        }
        const faces = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, faces);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(buffer), gl.STATIC_DRAW);

        this.buffers = {
            vertices: vertices,
            normals: normals,
            faces: faces,
        };
    }

    this.initRotation = function() {
        this.rotation = {
            cubes: null, // an array of Cubes
            axis: null,  // a vec3
            angle: 0,    // the total angle of rotation
            speed: 0,    // the rotational speed from the mouse movement
        };
    }

    this.isRotating = function() {
        return this.rotation.cubes !== null &&
            this.rotation.axis !== null &&
            this.rotation.speed !== 0;
    }

    this.init();

    this.draw = function() {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1i(shaderProgram.lighting, 1);

        glMatrix.mat4.perspective(
            projectionMatrix,
            FOV,
            gl.drawingBufferWidth / gl.drawingBufferHeight,
            Z_NEAR,
            Z_FAR
        );
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
     * Sets this.rotation.cubes to an array of cubes that are in the same plane as initCube, newCube, and axis.
     */
    this.setRotatedCubes = function(initIntersection, newIntersection, axis) {
        if (!initIntersection || !newIntersection || !axis) {
            return;
        }
        this.rotation.cubes = null;

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

        if (cubes.length === 9) {
            this.rotation.cubes = cubes;
        }
    }

    function inRange(value, origin, delta) {
        const lower = origin - delta;
        const upper = origin + delta;
        return lower < value && value < upper;
    }

    this.setRotationSpeed = function(initIntersection, newIntersection, axis, timeDelta) {
        if (!initIntersection || !newIntersection || !axis) {
            return;
        }

        const direction = glMatrix.vec3.cross(glMatrix.vec3.create(), axis, initIntersection.normal);
        const movement = glMatrix.vec3.subtract(glMatrix.vec3.create(), newIntersection.point, initIntersection.point);

        const dotProduct = glMatrix.vec3.dot(direction, glMatrix.vec3.normalize(glMatrix.vec3.create(), movement));
        if (Math.abs(dotProduct) > 0.85) {
           this.rotation.speed = dotProduct / timeDelta;
        }
    }

    this.select = function(x, y) {
        const offset = $canvas.offset();
        return this.boundingBox.intersection(event.pageX - offset.left, event.pageY - offset.top);
    }

    /*
     * Rotates this.rotation.cubes around this.rotation.axis by DEGREES.
     */
    this.startRotate = function(x, y, timestamp) {
        if (this.isRotating()) {
            return;
        }

        const start = this.select(x, y)
        if (!start) {
            return;
        }

        let debounce = false;
        $canvas.mousemove((event) => {
            if (debounce) {
                return;
            }

            const delta = event.timeStamp - timestamp;
            if (delta < DEBOUNCE_TIMEOUT) {
                return;
            }

            const end = this.select(event.pageX, event.pageY);

            // Set this.rotation.axis and this.rotation.cubes before starting a rotation.
            if (this.rotation.angle === 0)  {
                this.setRotationAxis(start, end);
                this.setRotatedCubes(start, end, this.rotation.axis);
            }

            this.setRotationSpeed(start, end, this.rotation.axis, delta);
            debounce = true;

            window.setTimeout(() => {
                debounce = false;
            }, DEBOUNCE_TIMEOUT);
        });
    }

    this.rotate = function(timeDelta) {
        if (!this.isRotating()) {
            return;
        }

        // A rotation has been completed. Stop rotating.
        if (Math.abs(this.rotation.angle) === 90) {
            this.initRotation();
            this.endRotate();
            return;
        }

        // Convert radians to degrees.
        let degrees = this.rotation.speed * timeDelta * 180 / Math.PI;
        if (Math.abs(this.rotation.angle + degrees) >= 90) {
            degrees = 90 - this.rotation.angle;
        }
        this.rotation.angle += degrees;

        const newRotationMatrix = glMatrix.mat4.create();
        glMatrix.mat4.fromRotation(newRotationMatrix, glMatrix.glMatrix.toRadian(degrees), this.rotation.axis);

        for (let cube of this.rotation.cubes) {
            cube.rotate(newRotationMatrix);
        }
    }

    this.endRotate = function() {
        leftMouseDown = false;
        $canvas.off('mousemove');
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

        this.rotation.axis = glMatrix.vec3.length(axis) === 1 ? axis : null;
    }

    this.scramble = function() {
        if (this.scrambleCycles === 0) {
            isRotating = false;
            isScrambling = false;
        } else {
            const plane = this.boundingBox.randomPlane();
            const initIntersection = {
                point: plane.randomPoint(),
                normal: plane.normal,
            }
            const newIntersection = {
                point: plane.randomPoint(),
                normal: plane.normal,
            }
            this.setRotationAxis(initIntersection, newIntersection);
            this.setRotatedCubes(initIntersection, newIntersection, this.rotation.axis);

            if (!this.rotation.axis || !this.rotation.cubes) {
                this.scramble();
                return;
            }
            isRotating = true;
            this.scrambleCycles--;
        }
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
            gl.bindBuffer(gl.ARRAY_BUFFER, rubiksCube.buffers.vertices);
            gl.vertexAttribPointer(shaderProgram.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            // normals
            gl.bindBuffer(gl.ARRAY_BUFFER, rubiksCube.buffers.normals);
            gl.vertexAttribPointer(shaderProgram.vertexNormal, 3, gl.FLOAT, false, 0, 0);
            // faces
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rubiksCube.buffers.faces);
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
    window.onresize = function () {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    };

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
        if (currentChild.nodeType === currentChild.TEXT_NODE) {
            source += currentChild.textContent;
        }
        currentChild = currentChild.nextSibling;
    }
    let shader;
    if (shaderScript.type === 'x-shader/x-fragment') {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type === 'x-shader/x-vertex') {
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

// timestamp is a DOMHighResTimeStamp.
// See https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame.
function drawScene() {
    let startTime = 0;

    const animate = function(timestamp) {
        const timeDelta = timestamp - startTime;

        rubiksCube.draw();
        rubiksCube.rotate(timeDelta);
        requestAnimationFrame(animate);

        startTime = timestamp;
    }
    return animate;
}

function start(data) {
    gl = initWebGL($canvas[0]);
    if (gl) {
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        initShaders();

        rubiksCube = new RubiksCube(data);
        perspectiveView();
        drawScene()(performance.now());
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

function startRotate(event) {
    // The Rubik's cube can be rotated with right mouse while it's being scrambled, but
    // individual layers of the cube cannot be rotated with left mouse.
    if (isLeftMouse(event)) {
        leftMouseDown = true;
        rubiksCube.startRotate(event.pageX, event.pageY, event.timeStamp);
    } else if (isRightMouse(event)) {
        rightMouseDown = true;
    }
}

function endRotate(event) {
    if (isLeftMouse(event)) {
        rubiksCube.endRotate();
    }
    rightMouseDown = false;
}

function isLeftMouse(event) {
    return event.button === LEFT_MOUSE && !event.ctrlKey
}

function isRightMouse(event) {
    return (event.button === LEFT_MOUSE && event.ctrlKey) || event.button === RIGHT_MOUSE
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
    $canvas = $('#glcanvas');

    const pathname = location.pathname;
    const base = pathname.substring(0, pathname.lastIndexOf('/'));

    $.get(`${base}/models/rubiks-cube.json`, function(data) {
        start(data[0]);
        $canvas.bind('contextmenu', function(e) { return false; });
        $canvas.mousedown(startRotate);
        $canvas.mouseup(endRotate);
        $canvas.mouseout(endRotate);
        $('body').keypress(togglePerspective);
    });
});
