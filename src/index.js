import ReactDOM from 'react-dom'

import * as THREE from 'three'
import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

// import drawThreeGeo from './threeGeoJSON'
// import drawThreeGeo from './threeGeoJSONv2'
import ThreejsGeoJson from './threejsGeoJson.js'

import './styles.css'

function Octahedron(props) {
  const [countries, setCountries] = useState([])
  const ref = useRef()

  useEffect(() => {
    // fetch('https://raw.githubusercontent.com/vasturiano/three-globe/master/example/country-polygons/ne_110m_admin_0_countries.geojson')
    fetch('/110m_geojson.json')
      .then((res) => res.json())
      .then((countries) => {
        if (ref) {
          // drawThreeGeo(
          //   countries,
          //   2,
          //   {
          //     color: 'blue',
          //     side: THREE.DoubleSide
          //   },
          //   ref.current
          // )
          const threejs = new ThreejsGeoJson(countries, 2, {}, ref.current)
          threejs.init()
          const result = threejs.drawGeoJSON()
        }
        setCountries(countries)
      })
  }, [])

  const { map, bump } = props

  const mapTexture = useMemo(() => new THREE.TextureLoader().load(map), [map])
  const bumpTexture = useMemo(() => new THREE.TextureLoader().load(bump), [bump])

  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry attach="geometry" args={[2, 128, 128]} />
        <meshStandardMaterial attach="material" map={mapTexture} bumpMap={bumpTexture} bumpScale={0.1} />
      </mesh>
    </group>
  )
}

const PointLight = () => {
  return <pointLight color={'white'} intensity={1} position={[10, 10, 10]} />
}

ReactDOM.render(
  <Canvas>
    <ambientLight color="lightblue" />
    <PointLight />
    <Octahedron
      map="https://raw.githubusercontent.com/chrisrzhou/react-globe/main/textures/globe_dark.jpg"
      bump="https://d3pmesr9f008up.cloudfront.net/darke.png"
    />
    <OrbitControls />
  </Canvas>,
  document.getElementById('root')
)
