import { $ } from 'jquery';
import { config } from './modules/config.js';
import { EYE, LIGHTS, RubiksCube, togglePerspective } from './modules/rubiks.js';

function initShaders(gl) {
    const fragmentShader = getShader(gl, 'fragmentShader');
    const vertexShader = getShader(gl, 'vertexShader');
    const shaderProgram = gl.createProgram();
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

    return shaderProgram;
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

function initWebGL(canvas) {
    if (!window.WebGLRenderingContext) {
        console.log("Your browser doesn't support WebGL.")
        return null;
    }

    const gl = canvas.getContext('webgl', {preserveDrawingBuffer: true}) || canvas.getContext('experimental-webgl', {preserveDrawingBuffer: true});
    if (!gl) {
        console.log("Your browser supports WebGL, but initialization failed.");
        return null;
    }

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    return gl;
}

// timestamp is a DOMHighResTimeStamp.
// See https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame.
function drawScene(rubiksCube) {
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

$(document).ready(function() {
    const $canvas = $('#glcanvas');
    $canvas.width = $canvas.clientWidth;
    $canvas.height = $canvas.clientHeight;
    window.onresize = function () {
        $canvas.width = $canvas.clientWidth;
        $canvas.height = $canvas.clientHeight;
    };
    const gl = initWebGL($canvas[0]);
    const shaderProgram = initShaders(gl);
    const pathname = location.pathname;
    const base = pathname.substring(0, pathname.lastIndexOf('/'));

    $.get(`${base}/models/rubiks-cube.json`, function(data) {
        const rubiksCube = new RubiksCube(data, gl, shaderProgram, $canvas);

        $canvas.bind('contextmenu', function() { return false; });
        $canvas.mousedown(rubiksCube.startRotate.bind(rubiksCube));
        $canvas.mouseup(rubiksCube.endRotate.bind(rubiksCube));
        $canvas.mouseout(rubiksCube.endRotate.bind(rubiksCube));
        $('body').keypress(togglePerspective);
        $('#scramble').click(() => scramble(rubiksCube));

        drawScene(rubiksCube)(performance.now());
    });
});

