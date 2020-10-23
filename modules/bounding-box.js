import { mat4, vec3, vec4 } from './modules/gl-matrix-min.js';

// The bounding box is a 6x6x6 cube, centered at the origin, that inscribes the Rubik's cube.
// Each face of the bounding box corresponds to a side of the Rubik's cube.
function BoundingBox(gl, projectionMatrix, modelViewMatrix, eye) {
    this.projectionMatrix = projectionMatrix;
    this.modelViewMatrix = modelViewMatrix;
    this.eye = eye;
    this.planes = [
        new Plane([-3, -3, 3], [3, -3, 3], [-3, 3, 3]), // front
        new Plane([-3, -3, -3], [-3, 3, -3], [3, -3, -3]), // back
        new Plane([-3, 3, 3], [3, 3, 3], [-3, 3, -3]), // top
        new Plane([-3, -3, 3], [-3, -3, -3], [3, -3, 3]), // bottom
        new Plane([-3, -3, -3], [-3, -3, 3], [-3, 3, -3]), // left
        new Plane([3, -3, -3], [3, 3, -3], [3, -3, 3]), // right
    ];

    this.intersection = function(x, y) {
        const start = this.unproject(x, y, 0);
        const end = this.unproject(x, y, 1);

        let intersection = null;
        let minDistance = Infinity;

        for (let plane of this.planes) {
            const p0Start = vec3.subtract(vec3.create(), start, plane.p0);
            const ray = vec3.subtract(vec3.create(), start, end);

            if (vec3.dot(ray, plane.normal) === 0) {
                return null;
            }

            const denominator = vec3.dot(ray, plane.normal);
            const t = vec3.dot(plane.normal, p0Start) / denominator;
            const u = vec3.dot(
               vec3.cross(vec3.create(), plane.p02, ray),
               p0Start
            ) / denominator;
            const v = vec3.dot(
               vec3.cross(vec3.create(), ray, plane.p01),
               p0Start
            ) / denominator;

            if (0 <= u && u <= 1 && 0 <= v && v <= 1) {
                const point = vec3.scale(vec3.create(), ray, -t);
                vec3.add(point, point, start);
                const worldPoint = vec4.transformMat4(
                    vec4.create(),
                    vec4.fromValues(...point, 1),
                    this.modelViewMatrix
                );

                // The (start, end) ray may intersect with multiple planes,
                // but we only want the intersection point closest to the eye/camera.
                //
                // The bounding box is in model space (local coordinates). We transform
                // it into world space when measuring the distance to the eye/camera to account for rotations.
                const distance = vec3.distance(this.eye, vec3.fromValues(...worldPoint));
                if (distance < minDistance) {
                    minDistance = distance;
                    intersection = {
                        point: point,
                        normal: vec3.normalize(vec3.create(), plane.normal),
                    }
                }
            }
        }
        return intersection;
    }

    function screenToClipCoordinates(x, y, z, width, height) {
        const clipX = 2 * x / width - 1;
        const clipY = 1 - 2 * y / height;
        const clipZ = 2 * z - 1;
        return vec4.fromValues(clipX, clipY, clipZ, 1);
    }

    this.unproject = function(x, y, z) {
        const unprojectMatrix = mat4.create();
        mat4.multiply(unprojectMatrix, this.projectionMatrix, this.modelViewMatrix);
        mat4.invert(unprojectMatrix, unprojectMatrix);
        const clip = screenToClipCoordinates(x, y, z, gl.drawingBufferWidth, gl.drawingBufferHeight);
        const world = vec4.create();
        vec4.transformMat4(world, clip, unprojectMatrix);
        vec4.scale(world, world, 1 / world[3]);
        return vec3.fromValues(...world);
    }

    this.randomPlane = function() {
        const i = Math.floor(Math.random() * this.planes.length);
        return this.planes[i];
    }
}

function Plane(p0, p1, p2) {
    this.p0 = p0;
    this.p01 = vec3.subtract(vec3.create(), p1, p0);
    this.p02 = vec3.subtract(vec3.create(), p2, p0);
    this.normal = vec3.cross(vec3.create(), this.p01, this.p02);

    this.randomPoint = function() {
        const point = vec3.copy(vec3.create(), p0);
        vec3.add(point, point, vec3.scale(vec3.create(), this.p01, Math.random()));
        vec3.add(point, point, vec3.scale(vec3.create(), this.p02, Math.random()));
        return point;
    }
}

export { BoundingBox };
