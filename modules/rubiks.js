import { glMatrix, mat4, vec3, mat3 } from './modules/gl-matrix-min.js';
import BoundingBox from './modules/bouding-box.js';

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
const VIEW_MATRIX = mat4.lookAt(mat4.create(), EYE, CENTER, UP);
const FOV = glMatrix.toRadian(70);
const Z_NEAR = 1;
const Z_FAR = 100;
const LEFT_MOUSE = 0;
const RIGHT_MOUSE = 2;
const DEBOUNCE_TIMEOUT = 50;

var leftMouseDown = false;
var rightMouseDown = false;

var modelViewMatrix = mat4.create();
var projectionMatrix = mat4.create();
var rotationMatrix = mat4.create();

function RubiksCube(data, gl, shaderProgram, $canvas) {
    this.buffers = null;
    this.rotation = null;
    this.scrambleCycles = 0;
    this.cubes = new Array(3);
    this.boundingBox = new BoundingBox(gl, projectionMatrix, modelViewMatrix, EYE);

    this.init = function() {
        this.initBuffers();
        this.initRotation();

        for (let r = 0; r < 3; r++) {
            this.cubes[r] = new Array(3);
            for (let g = 0; g < 3; g++) {
                this.cubes[r][g] = new Array(3);
                for (let b = 0; b < 3; b++) {
                    // Each cube has dimensions 2x2x2 units.
                    const coordinates = vec3.fromValues(2 * (r - 1), 2 * (g - 1), 2 * (b - 1));
                    const cube = new Cube(this, coordinates, data, gl, shaderProgram);
                    this.cubes[r][g][b] = cube;
                }
            }
        }
    }

    this.initBuffers = function() {
        const vertices = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertices), gl.STATIC_DRAW);

        const normals = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normals);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.normals), gl.STATIC_DRAW);

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
        const isRotating = !!this.rotation.axis && this.rotation.speed !== 0;
        return rightMouseDown ? isRotating : isRotating && !!this.rotation.cubes;
    }

    this.init();

    this.draw = function() {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1i(shaderProgram.lighting, 1);

        mat4.perspective(
            projectionMatrix,
            FOV,
            gl.drawingBufferWidth / gl.drawingBufferHeight,
            Z_NEAR,
            Z_FAR
        );
        mat4.multiply(modelViewMatrix, VIEW_MATRIX, rotationMatrix);
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
     * Sets this.rotation.cubes to an array of cubes that are in the plane that
     * 1. contains `initIntersection` and `newIntersection`
     * 2. is perpendicular to `axis`
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

    /*
     * Sets this.rotation.speed to the angular displacement over `timeDelta`, measured in radians per millisecond.
     */
    this.setRotationSpeed = function(initIntersection, newIntersection, axis, timeDelta) {
        if (!initIntersection || !newIntersection || !axis) {
            return;
        }

        const direction = vec3.cross(vec3.create(), axis, initIntersection.normal);
        const movement = vec3.subtract(vec3.create(), newIntersection.point, initIntersection.point);

        const dotProduct = vec3.dot(direction, vec3.normalize(vec3.create(), movement));
        if (Math.abs(dotProduct) > 0.9) {
            this.rotation.speed = vec3.length(movement) / timeDelta;
        }
    }

    this.select = function(event) {
        const offset = $canvas.offset();
        return this.boundingBox.intersection(event.pageX - offset.left, event.pageY - offset.top);
    }

    /*
     * Starts a rotation by registering a `mousemove` event handler and intializing rotation state.
     */
    this.startRotate = function(event) {
        if (this.isRotating()) {
            return;
        }

        leftMouseDown = isLeftMouse(event);
        rightMouseDown = isRightMouse(event);

        const start = this.select(event);
        if (!start) {
            return;
        }

        $canvas.mousemove(debounce((ev) => {
            const delta = ev.timeStamp - event.timeStamp;
            if (leftMouseDown) {
                const end = this.select(ev);
                if (!end) {
                    return;
                }

                // Set this.rotation.axis and this.rotation.cubes before starting a rotation.
                if (this.rotation.angle === 0)  {
                    this.setRotationAxis(start, end);
                    this.setRotatedCubes(start, end, this.rotation.axis);
                }
                this.setRotationSpeed(start, end, this.rotation.axis, delta);
            } else if (rightMouseDown) {
                const deltaTime = ev.timeStamp - event.timeStamp;
                const deltaX = ev.pageX - event.pageX;
                const deltaY = ev.pageY - event.pageY;
                const degrees = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                this.rotation.speed = glMatrix.toRadian(degrees) / deltaTime;
                this.rotation.axis = [deltaY, deltaX, 0];
            }
        }, DEBOUNCE_TIMEOUT));
    }

    /*
     * Rotates the Rubik's cube or a cube layer by the angle of rotation.
     */
    this.rotate = function(timeDelta) {
        if (!this.isRotating()) {
            return;
        }

        // Convert radians to degrees.
        let degrees = this.rotation.speed * timeDelta * 180 / Math.PI;

        // Continue the cube layer rotation that was started with left mouse,
        // even if left mouse is no longer being pressed.
        if (this.rotation.cubes) {
            // A rotation has been completed. Stop rotating.
            if (glMatrix.equals(Math.abs(this.rotation.angle), 90)) {
                this.endRotate();
                this.initRotation();

                if (this.scrambleCycles > 0) {
                    this.scramble();
                }
                return;
            }

            if (Math.abs(this.rotation.angle + degrees) >= 90) {
                degrees = 90 - this.rotation.angle;
            }
            this.rotation.angle += degrees;

            const newRotationMatrix = mat4.create();
            mat4.fromRotation(newRotationMatrix, glMatrix.toRadian(degrees), this.rotation.axis);

            for (let cube of this.rotation.cubes) {
                cube.rotate(newRotationMatrix);
            }
        } else if (rightMouseDown) {
            const axis = this.rotation.axis;
            const newRotationMatrix = mat4.create();
            mat4.fromRotation(newRotationMatrix, glMatrix.toRadian(degrees), axis);
            mat4.multiply(rotationMatrix, newRotationMatrix, rotationMatrix);
        }
    }

    /*
     * Cleans up rotation state after left/right mouse has been released.
     */
    this.endRotate = function() {
        $canvas.off('mousemove');

        if (leftMouseDown) {
            leftMouseDown = false;
        }
        if (rightMouseDown) {
            rightMouseDown = false;
            this.initRotation();
        }
    }

    this.setRotationAxis = function(initIntersection, newIntersection) {
        if (!initIntersection || !newIntersection) {
            return;
        }

        const axis = vec3.create();

        // The selected stickers are on the same face of the Rubik's cube.
        if (vec3.equals(initIntersection.normal, newIntersection.normal)) {
            const direction = vec3.create();
            vec3.subtract(direction, newIntersection.point, initIntersection.point);
            vec3.cross(axis, initIntersection.normal, direction);
        } else {
            vec3.cross(axis, initIntersection.normal, newIntersection.normal);
        }

        vec3.normalize(axis, axis);
        vec3.round(axis, axis);
        this.rotation.axis = vec3.length(axis) === 1 ? axis : null;
    }

    this.scramble = function() {
        if (this.scrambleCycles === 0) {
            return;
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
            this.rotation.speed = 0.005;

            this.isRotating() ? this.scrambleCycles-- : this.scramble();
        }
    }
}

function Cube(rubiksCube, coordinates, data, gl, shaderProgram) {
    this.rotationMatrix = mat4.create();
    this.coordinates = coordinates;

    this.rotate = function(newRotationMatrix) {
        mat4.multiply(this.rotationMatrix, newRotationMatrix, this.rotationMatrix);
        vec3.transformMat4(this.coordinates, this.coordinates, newRotationMatrix);
   }

    this.transform = function() {
        mat4.translate(modelViewMatrix, modelViewMatrix, this.coordinates);
        mat4.multiply(modelViewMatrix, modelViewMatrix, this.rotationMatrix);
    }

    this.draw = function() {
        const mvMatrix = mat4.create();
        mat4.copy(mvMatrix, modelViewMatrix);
        this.transform();
        setMatrixUniforms(gl, shaderProgram);

        let offset = 0;
        for (let faceGroup of data.faces) {
            const material = faceGroup.material;
            // Blender doesn't seem to support per-object ambient colors or export the global ambient color,
            // so we compute our own ambient color as a darker version of the diffuse color.
            const ambient = vec3.create();
            vec3.scale(ambient, material.diffuse, 0.4);
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

        mat4.copy(modelViewMatrix, mvMatrix);
    }
}

function debounce(f, timeout) {
    let shouldDebounce = true;

    return (event) => {
        if (shouldDebounce) {
            window.setTimeout(() => {
                shouldDebounce = false;
            }, timeout);
            return;
        }

        f(event);
        shouldDebounce = true;
    }
}

function setMatrixUniforms(gl, shaderProgram) {
    const projectionUniform = gl.getUniformLocation(shaderProgram, 'projectionMatrix');
    gl.uniformMatrix4fv(projectionUniform, false, projectionMatrix);

    const modelViewUniform = gl.getUniformLocation(shaderProgram, 'modelViewMatrix');
    gl.uniformMatrix4fv(modelViewUniform, false, modelViewMatrix);

    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, modelViewMatrix);
    mat4.transpose(normalMatrix, normalMatrix);
    const normalMatrix3 = mat3.create();
    mat3.fromMat4(normalMatrix3, normalMatrix);
    const normalMatrixUniform = gl.getUniformLocation(shaderProgram, 'normalMatrix');
    gl.uniformMatrix3fv(normalMatrixUniform, false, normalMatrix3);
}

function isLeftMouse(event) {
    return event.button === LEFT_MOUSE && !event.ctrlKey
}

function isRightMouse(event) {
    return (event.button === LEFT_MOUSE && event.ctrlKey) || event.button === RIGHT_MOUSE
}

function topView() {
    mat4.identity(rotationMatrix);
    mat4.rotateX(rotationMatrix, rotationMatrix, glMatrix.toRadian(90));
}

function bottomView() {
    mat4.identity(rotationMatrix);
    mat4.rotateX(rotationMatrix, rotationMatrix, glMatrix.toRadian(-90));
}

function leftView() {
    mat4.identity(rotationMatrix);
    mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.toRadian(-90));
}

function rightView() {
    mat4.identity(rotationMatrix);
    mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.toRadian(90));
}

function frontView() {
    mat4.identity(rotationMatrix);
    mat4.identity(rotationMatrix);
}

function backView() {
    mat4.identity(rotationMatrix);
    mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.toRadian(180));
}

function perspectiveView() {
    mat4.identity(rotationMatrix);
    mat4.rotateX(rotationMatrix, rotationMatrix, glMatrix.toRadian(30));
    mat4.rotateY(rotationMatrix, rotationMatrix, glMatrix.toRadian(45));
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

function scramble(rubiksCube) {
    if (rubiksCube.scrambleCycles === 0) {
        rubiksCube.scrambleCycles = Math.ceil(Math.random() * 10 + 10); // an integer between 10 and 20
        rubiksCube.scramble();
    }
}

export { EYE, LIGHTS, RubiksCube, scramble, togglePerspective };
