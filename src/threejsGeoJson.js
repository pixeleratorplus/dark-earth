// https://stackoverflow.com/questions/54484537/polygon-triangulation-for-globe
// http://jsfiddle.net/jseb8qun/
/* Draw GeoJSON
Iterates through the latitude and longitude values, converts the values to XYZ coordinates, and draws the geoJSON geometries.
*/

import * as THREE from 'three'
import Delaunator from 'delaunator'

const TRIANGULATION_DENSITY = 5 // make it smaller for more dense mesh

class ThreejsGeoJson {
  constructor(json, radius, options, container) {
    this.json = json
    this.radius = radius
    this.options = options
    this.container = container || window.scene
    this.output = {}
  }

  init() {
    this.output = {
      type: 'FeatureCollection',
      features: []
    }

    this.output.features = this.json.features.map((d) => {
      const properties = {
        name: d.properties.NAME,
        iso_a3: d.properties.ISO_A3
      }

      return {
        properties,
        xValues: [],
        yValues: [],
        zValues: [],
        triangles: []
      }
    })
  }

  drawGeoJSON() {
    const json_geom = this.createGeometryArray(this.json)
    const someColors = [0x909090, 0x808080, 0xa0a0a0, 0x929292, 0x858585, 0xa9a9a9]

    for (let geom_num = 0; geom_num < json_geom.length; geom_num++) {
      if (json_geom[geom_num].type === 'Polygon') {
        const group = this.createGroup(geom_num)
        const randomColor = someColors[Math.floor(someColors.length * Math.random())]

        for (let segment_num = 0; segment_num < json_geom[geom_num].coordinates.length; segment_num++) {
          const coords = json_geom[geom_num].coordinates[segment_num]
          const refined = this.genInnerVerts(coords)
          const flat = this.verts2array(refined)
          const d = new Delaunator(flat)
          this.removeOuterTriangles(d, coords)

          const delaunayVerts = this.array2verts(d.coords)

          const xValues = []
          const yValues = []
          const zValues = []
          for (let point_num = 0; point_num < delaunayVerts.length; point_num++) {
            const { xValue, yValue, zValue } = this.convertToSphereCoords(delaunayVerts[point_num])
            xValues.push(xValue)
            yValues.push(yValue)
            zValues.push(zValue)
          }

          this.mergeJsonMesh(geom_num, xValues, yValues, zValues, d.triangles)

          this.drawMesh(group, xValues, yValues, zValues, d.triangles, randomColor)
        }
      } else if (json_geom[geom_num].type === 'MultiPolygon') {
        const group = this.createGroup(geom_num)
        const randomColor = someColors[Math.floor(someColors.length * Math.random())]

        for (let polygon_num = 0; polygon_num < json_geom[geom_num].coordinates.length; polygon_num++) {
          for (let segment_num = 0; segment_num < json_geom[geom_num].coordinates[polygon_num].length; segment_num++) {
            const coords = json_geom[geom_num].coordinates[polygon_num][segment_num]
            const refined = this.genInnerVerts(coords)
            const flat = this.verts2array(refined)
            const d = new Delaunator(flat)
            this.removeOuterTriangles(d, coords)

            const delaunayVerts = this.array2verts(d.coords)

            const xValues = []
            const yValues = []
            const zValues = []
            for (let point_num = 0; point_num < delaunayVerts.length; point_num++) {
              const { xValue, yValue, zValue } = this.convertToSphereCoords(delaunayVerts[point_num])
              xValues.push(xValue)
              yValues.push(yValue)
              zValues.push(zValue)
            }

            this.mergeJsonMesh(geom_num, xValues, yValues, zValues, d.triangles)

            this.drawMesh(group, xValues, yValues, zValues, d.triangles, randomColor)
          }
        }
      } else {
        throw new Error('The geoJSON is not valid.')
      }
    }

    return this.output
  }

  mergeJsonMesh(index, xValues, yValues, zValues, triangles) {
    this.output.features[index].xValues = xValues
    this.output.features[index].yValues = yValues
    this.output.features[index].zValues = zValues
    this.output.features[index].triangles = triangles
  }

  createGroup(idx) {
    const group = new THREE.Group()
    group.userData.userText = '_' + idx
    this.container.add(group)
    return group
  }

  drawMesh(group, xValues, yValues, zValues, triangles, color) {
    const geometry = new THREE.BufferGeometry()
    this.createVertexForEachPoint(geometry, xValues, yValues, zValues, triangles)
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        side: THREE.DoubleSide,
        color: color
      })
    )
    group.add(mesh)
  }

  convertToSphereCoords(coordinates) {
    const lon = coordinates[0]
    const lat = coordinates[1]

    const xValue = Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180) * this.radius
    const yValue = Math.sin((lat * Math.PI) / 180) * this.radius
    const zValue = -Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180) * this.radius

    return {
      xValue,
      yValue,
      zValue
    }
  }

  verts2array(coords) {
    const flat = []

    for (let k = 0; k < coords.length; k++) {
      flat.push(coords[k][0], coords[k][1])
    }

    return flat
  }

  array2verts(arr) {
    const coords = []

    for (let k = 0; k < arr.length; k += 2) {
      coords.push([arr[k], arr[k + 1]])
    }

    return coords
  }

  findBBox(points) {
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

  isInside(point, vs) {
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

      if (intersect) {
        inside = !inside
      }
    }

    return inside
  }

  genInnerVerts(points) {
    const res = []

    for (let k = 0; k < points.length; k++) {
      res.push(points[k])
    }

    const bbox = this.findBBox(points)

    const step = TRIANGULATION_DENSITY
    let k = 0
    for (let x = bbox.min.x + step / 2; x < bbox.max.x; x += step) {
      for (let y = bbox.min.y + step / 2; y < bbox.max.y; y += step) {
        const newp = [x, y]

        if (this.isInside(newp, points)) {
          res.push(newp)
        }

        k++
      }
    }

    return res
  }

  removeOuterTriangles(delaunator, points) {
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

      if (this.isInside(midp, points)) {
        newTriangles.push(t0, t1, t2)
      }
    }

    delaunator.triangles = newTriangles
  }

  createGeometryArray(json) {
    const geometry_array = []

    if (json.type === 'Feature') {
      geometry_array.push(json.geometry)
    } else if (json.type === 'FeatureCollection') {
      for (let feature_num = 0; feature_num < json.features.length; feature_num++) {
        geometry_array.push(json.features[feature_num].geometry)
      }
    } else if (json.type === 'GeometryCollection') {
      for (let geom_num = 0; geom_num < json.geometries.length; geom_num++) {
        geometry_array.push(json.geometries[geom_num])
      }
    } else {
      throw new Error('The geoJSON is not valid.')
    }
    return geometry_array
  }

  createVertexForEachPoint(object_geometry, values_axis1, values_axis2, values_axis3, triangles) {
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
}

export default ThreejsGeoJson
