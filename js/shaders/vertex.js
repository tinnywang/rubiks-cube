attribute vec3 vertexPosition;
attribute vec3 vertexNormal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

varying vec4 position;
varying vec3 normal;

void main(void) {
    position = modelViewMatrix * vec4(vertexPosition, 1.0);
    gl_Position = projectionMatrix * position;
    normal = normalize(normalMatrix * vertexNormal);
}
