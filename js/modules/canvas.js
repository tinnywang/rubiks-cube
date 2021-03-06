function initCanvas(id) {
    const $canvas = $(id);
    const canvas = $canvas[0];
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    window.onresize = function () {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    };

    return $canvas
}

export default initCanvas;
