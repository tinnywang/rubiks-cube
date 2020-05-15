const Z_INDEX = 2;

function BoundingBox(eye) {
    this.eye = eye;
    this.planes = [
        new Plane([-3, -3, 3], [-3, 3, 3], [3, -3, 3]), // front
        new Plane([-3, -3, -3], [-3, 3, -3], [3, -3, -3]), // back
        new Plane([-3, 3, 3], [-3, 3, -3], [3, 3, 3]), // top
        new Plane([-3, -3, 3], [-3, -3, -3], [3, -3, 3]), // bottom
        new Plane([-3, -3, -3], [-3, 3, -3], [-3, -3, 3]), // left
        new Plane([3, -3, -3], [3, 3, -3], [3, -3, 3]), // right
    ];

    this.intersection = function(start, end, modelViewMatrix) {
        let intersectionPoint = null;
        let minDistance = Infinity;

        for (let plane of this.planes) {
            const p0Start = glMatrix.vec3.subtract(glMatrix.vec3.create(), start, plane.p0);
            const ray = glMatrix.vec3.subtract(glMatrix.vec3.create(), start, end);

            if (glMatrix.vec3.dot(ray, plane.normal) === 0) {
                return null;
            }

            const denominator = glMatrix.vec3.dot(ray, plane.normal);
            const t = glMatrix.vec3.dot(plane.normal, p0Start) / denominator;
            const u = glMatrix.vec3.dot(
               glMatrix.vec3.cross(glMatrix.vec3.create(), plane.p02, ray),
               p0Start,
            ) / denominator;
            const v = glMatrix.vec3.dot(
               glMatrix.vec3.cross(glMatrix.vec3.create(), ray, plane.p01),
               p0Start,
            ) / denominator;

            if (0 <= u && u <= 1 && 0 <= v && v <= 1) {
                const point = glMatrix.vec3.scale(glMatrix.vec3.create(), ray, -t);
                glMatrix.vec3.add(point, point, start);
                const worldPoint = glMatrix.vec4.transformMat4(
                    glMatrix.vec4.create(),
                    glMatrix.vec4.fromValues(...point, 1),
                    modelViewMatrix
                );

                // The (start, end) ray may intersect with multiple planes,
                // but we only want the intersection point closest to the eye/camera.
                //
                // The bounding box is in model space (local coordinates). We transform
                // it into world space when measuring the distance to the eye/camera to account for rotations.
                const distance = glMatrix.vec3.distance(this.eye, glMatrix.vec3.fromValues(...worldPoint));
                if (distance < minDistance) {
                    minDistance = distance;
                    intersectionPoint = point;
                }
            }
        }
        return intersectionPoint;
    }
}

function Plane(p0, p1, p2) {
    this.p0 = p0;
    this.p01 = glMatrix.vec3.subtract(glMatrix.vec3.create(), p1, p0);
    this.p02 = glMatrix.vec3.subtract(glMatrix.vec3.create(), p2, p0);
    this.normal = glMatrix.vec3.cross(glMatrix.vec3.create(), this.p01, this.p02);
}
