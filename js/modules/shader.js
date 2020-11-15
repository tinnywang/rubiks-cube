import 'https://code.jquery.com/jquery-3.5.1.min.js';

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

function compileShader(gl, src, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log('An error occurred while compiling the shader: ' + gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

function initShader(gl) {
    const shaderProgram = gl.createProgram();

    SHADER_LOADER.load(function(data) {
        const vertexShader = compileShader(gl, data.shader.vertex, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(gl, data.shader.fragment, gl.FRAGMENT_SHADER)

        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            console.log('Unable to initialize the shader program');
            return;
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
    });

    return shaderProgram;
}

export { EYE, initShader };
