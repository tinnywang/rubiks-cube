#!/usr/bin/env python

import json
import numpy
import sys

vertices = []
vertex_normals = []
faces = []
vertex_normals_aggregate = []
normals = []

def parse(obj_file):
    f = open(obj_file, 'r')
    for line in f:
        data = line.split()
        definition = data[0]
        if definition == 'v': # vertex
            vertices.extend([float(x) for x in data[1:]])
            vertex_normals_aggregate.append([numpy.array([0.0, 0.0, 0.0]), 0])
        elif definition == 'vn': # vertex normal
            vertex_normals.append([float(x) for x in data[1:]])
        elif definition == 'f': # face, vertex/normal format
            for vertex_normal in data[1:]:
                vertex_normal = vertex_normal.split('//')
                vertex_index = int(vertex_normal[0]) - 1
                faces.append(vertex_index)
                normal_index = int(vertex_normal[1]) - 1
                normal_data = vertex_normals_aggregate[vertex_index]
                normal_data[0] = normal_data[0] + vertex_normals[normal_index]
                normal_data[1] += 1
    for i in range(0, len(vertex_normals_aggregate)):
        normal = vertex_normals_aggregate[i][0] / vertex_normals_aggregate[i][1]
        normal /= numpy.linalg.norm(normal)
        normals.extend(normal)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.stderr.write('usage: obj_to_json obj_file\n')
        sys.exit(1)
    parse(sys.argv[1])
    print json.dumps({
        'vertices': vertices,
        'faces': faces,
        'normals': normals
    })
