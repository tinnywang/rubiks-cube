const EYE = [0, 0, 20];
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

function initShader(gl) {
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

export { EYE, initShader };
