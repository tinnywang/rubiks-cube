varying highp vec4 position;
varying highp vec3 normal;

const int NUM_LIGHTS = 2;
struct Light {
    highp vec3 position;
    highp float intensity;
};
uniform Light lights[NUM_LIGHTS];

uniform bool lighting;
uniform highp vec3 eye;
uniform highp vec3 ambient;
uniform highp vec3 diffuse;
uniform highp vec3 specular;
uniform highp float specularExponent;

void main(void) {
    if (lighting) {
        for (int i = 0; i < NUM_LIGHTS; i++) {
            Light light = lights[i];
            highp vec3 position = position.xyz / position.w;
            highp vec3 eyeDirection = normalize(eye - position);
            highp vec3 lightDirection = normalize(light.position - position);
            highp vec3 diffuseTerm = diffuse * light.intensity * max(dot(lightDirection, normal), 0.0);
            highp vec3 reflection = normalize(reflect(-lightDirection, normal));
            highp vec3 specularTerm = specular * light.intensity * pow(max(dot(reflection, eyeDirection), 0.0), specularExponent);
            gl_FragColor += vec4(diffuseTerm + specularTerm + ambient, 1.0);
        }
    } else {
        gl_FragColor = vec4(diffuse, 1.0);
    }
}
