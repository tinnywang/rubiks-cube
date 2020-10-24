import 'https://code.jquery.com/jquery-3.5.1.min.js';
import initCanvas from './modules/canvas.js';
import initWebGL from './modules/gl.js';
import { perspectiveView, RubiksCube, scramble, togglePerspective } from './modules/rubiks.js';
import { initShader } from './modules/shader.js';

const $ = window.$;

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
    const $canvas = initCanvas('#glcanvas');
    const gl = initWebGL($canvas[0]);
    const shaderProgram = initShader(gl);
    const pathname = location.pathname;
    const base = pathname.substring(0, pathname.lastIndexOf('/'));

    $.get(`${base}/models/rubiks-cube.json`, function(data) {
        const rubiksCube = new RubiksCube(data[0], gl, shaderProgram, $canvas);

        $canvas.bind('contextmenu', function() { return false; });
        $canvas.mousedown(rubiksCube.startRotate.bind(rubiksCube));
        $canvas.mouseup(rubiksCube.endRotate.bind(rubiksCube));
        $canvas.mouseout(rubiksCube.endRotate.bind(rubiksCube));
        $('body').keypress(togglePerspective);
        $('#scramble').click(() => scramble(rubiksCube));

        perspectiveView();
        drawScene(rubiksCube)(performance.now());
    });
});

