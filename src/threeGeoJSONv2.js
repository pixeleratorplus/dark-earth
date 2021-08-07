// https://stackoverflow.com/questions/54484537/polygon-triangulation-for-globe
// http://jsfiddle.net/jseb8qun/
/* Draw GeoJSON
Iterates through the latitude and longitude values, converts the values to XYZ coordinates, and draws the geoJSON geometries.
*/

import * as THREE from 'three'
import Delaunator from 'delaunator'
// import { Geometry, Face3 } from 'three/examples/jsm/deprecated/Geometry.js'

const TRIANGULATION_DENSITY = 5 // make it smaller for more dense mesh

function verts2array(coords) {
  const flat = []
  for (let k = 0; k < coords.length; k++) {
    flat.push(coords[k][0], coords[k][1])
  }
  return flat
}

function array2verts(arr) {
  const coords = []
  for (let k = 0; k < arr.length; k += 2) {
    coords.push([arr[k], arr[k + 1]])
  }
  return coords
}

function findBBox(points) {
  const min = {
    x: 1e99,
    y: 1e99
  }
  const max = {
    x: -1e99,
    y: -1e99
  }
  for (let point_num = 0; point_num < points.length; point_num++) {
    if (points[point_num][0] < min.x) {
      min.x = points[point_num][0]
    }
    if (points[point_num][0] > max.x) {
      max.x = points[point_num][0]
    }
    if (points[point_num][1] < min.y) {
      min.y = points[point_num][1]
    }
    if (points[point_num][1] > max.y) {
      max.y = points[point_num][1]
    }
  }
  return {
    min: min,
    max: max
  }
}

function isInside(point, vs) {
  // ray-casting algorithm based on
  // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

  const x = point[0]
  const y = point[1]

  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0]
    const yi = vs[i][1]
    const xj = vs[j][0]
    const yj = vs[j][1]

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }

  return inside
}

function genInnerVerts(points) {
  const res = []
  for (let k = 0; k < points.length; k++) {
    res.push(points[k])
  }

  const bbox = findBBox(points)

  const step = TRIANGULATION_DENSITY
  let k = 0
  for (let x = bbox.min.x + step / 2; x < bbox.max.x; x += step) {
    for (let y = bbox.min.y + step / 2; y < bbox.max.y; y += step) {
      const newp = [x, y]
      if (isInside(newp, points)) {
        res.push(newp)
      }
      k++
    }
  }

  return res
}

function removeOuterTriangles(delaunator, points) {
  const newTriangles = []
  for (let k = 0; k < delaunator.triangles.length; k += 3) {
    const t0 = delaunator.triangles[k]
    const t1 = delaunator.triangles[k + 1]
    const t2 = delaunator.triangles[k + 2]

    const x0 = delaunator.coords[2 * t0]
    const y0 = delaunator.coords[2 * t0 + 1]

    const x1 = delaunator.coords[2 * t1]
    const y1 = delaunator.coords[2 * t1 + 1]

    const x2 = delaunator.coords[2 * t2]
    const y2 = delaunator.coords[2 * t2 + 1]

    const midx = (x0 + x1 + x2) / 3
    const midy = (y0 + y1 + y2) / 3

    const midp = [midx, midy]

    if (isInside(midp, points)) {
      newTriangles.push(t0, t1, t2)
    }
  }
  delaunator.triangles = newTriangles
}

let x_values = []
let y_values = []
let z_values = []

const someColors = [0x909090, 0x808080, 0xa0a0a0, 0x929292, 0x858585, 0xa9a9a9]

function drawThreeGeo(json, radius, options, container) {
  container = container || window.scene

  const json_geom = createGeometryArray(json)

  for (let geom_num = 0; geom_num < json_geom.length; geom_num++) {
    if (json_geom[geom_num].type === 'Polygon') {
      const group = createGroup(geom_num)
      const randomColor = someColors[Math.floor(someColors.length * Math.random())]

      for (let segment_num = 0; segment_num < json_geom[geom_num].coordinates.length; segment_num++) {
        const coords = json_geom[geom_num].coordinates[segment_num]
        const refined = genInnerVerts(coords)
        const flat = verts2array(refined)
        const d = new Delaunator(flat)
        removeOuterTriangles(d, coords)

        const delaunayVerts = array2verts(d.coords)
        for (let point_num = 0; point_num < delaunayVerts.length; point_num++) {
          convertToSphereCoords(delaunayVerts[point_num], radius)
        }

        drawMesh(group, y_values, z_values, x_values, d.triangles, randomColor)
      }
    } else if (json_geom[geom_num].type === 'MultiPolygon') {
      const group = createGroup(geom_num)
      const randomColor = someColors[Math.floor(someColors.length * Math.random())]

      for (let polygon_num = 0; polygon_num < json_geom[geom_num].coordinates.length; polygon_num++) {
        for (let segment_num = 0; segment_num < json_geom[geom_num].coordinates[polygon_num].length; segment_num++) {
          const coords = json_geom[geom_num].coordinates[polygon_num][segment_num]
          const refined = genInnerVerts(coords)
          const flat = verts2array(refined)
          const d = new Delaunator(flat)
          removeOuterTriangles(d, coords)

          const delaunayVerts = array2verts(d.coords)
          for (let point_num = 0; point_num < delaunayVerts.length; point_num++) {
            convertToSphereCoords(delaunayVerts[point_num], radius)
          }

          drawMesh(group, y_values, z_values, x_values, d.triangles, randomColor)
        }
      }
    } else {
      throw new Error('The geoJSON is not valid.')
    }
  }

  function createGroup(idx) {
    const group = new THREE.Group()
    group.userData.userText = '_' + idx
    container.add(group)
    return group
  }

  function drawMesh(group, x_values, y_values, z_values, triangles, color) {
    const geometry = new THREE.BufferGeometry()
    // const geometry = new Geometry()
    createVertexForEachPoint(geometry, x_values, y_values, z_values, triangles)

    // for (let k = 0; k < x_values.length; k++) {
    //   geometry.vertices.push(new THREE.Vector3(x_values[k], x_values[k], x_values[k]))
    // }

    // for (let k = 0; k < triangles.length; k += 3) {
    //   geometry.faces.push(new Face3(triangles[k], triangles[k + 1], triangles[k + 2]))
    // }

    // geometry.computeVertexNormals()

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        side: THREE.DoubleSide,
        color: color
        // wireframe: true
      })
    )
    group.add(mesh)

    clearArrays()
  }
}

function createGeometryArray(json) {
  const geometry_array = []

  if (json.type === 'Feature') {
    geometry_array.push(json.geometry)
  } else if (json.type === 'FeatureCollection') {
    for (var feature_num = 0; feature_num < json.features.length; feature_num++) {
      geometry_array.push(json.features[feature_num].geometry)
    }
  } else if (json.type === 'GeometryCollection') {
    for (var geom_num = 0; geom_num < json.geometries.length; geom_num++) {
      geometry_array.push(json.geometries[geom_num])
    }
  } else {
    throw new Error('The geoJSON is not valid.')
  }
  return geometry_array
}

function convertToSphereCoords(coordinates_array, sphere_radius) {
  const lon = coordinates_array[0]
  const lat = coordinates_array[1]

  x_values.push(Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180) * sphere_radius)
  y_values.push(Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180) * sphere_radius)
  z_values.push(Math.sin((lat * Math.PI) / 180) * sphere_radius)
}

function createVertexForEachPoint(object_geometry, values_axis1, values_axis2, values_axis3, triangles) {
  const tVertices = []
  for (var i = 0; i < values_axis1.length; i++) {
    tVertices.push(new THREE.Vector3(values_axis1[i], values_axis2[i], values_axis3[i]))
  }

  const tFaces = []
  for (let k = 0; k < triangles.length; k += 3) {
    tFaces.push(triangles[k], triangles[k + 1], triangles[k + 2])
  }

  object_geometry.setFromPoints(tVertices)
  object_geometry.setIndex(tFaces)
  object_geometry.computeVertexNormals()
}

function clearArrays() {
  x_values.length = 0
  y_values.length = 0
  z_values.length = 0
}

export default drawThreeGeo
