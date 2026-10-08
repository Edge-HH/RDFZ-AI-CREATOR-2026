import * as THREE from 'three';
import marsUrl from '../assets/textures/mars.jpg';
import earthUrl from '../assets/textures/earth.jpg';
import type { Tier } from './scenes/common';

// NASA 公有领域影像（构建时内联为 data URL，file:// 下也能作为 WebGL 纹理）
// 火星：NASA/JPL-Caltech（Viking 影像，USGS 处理）；地球：NASA Earth Observatory Blue Marble Next Generation
const URLS = { mars: marsUrl, earth: earthUrl } as const;
export type Planet = keyof typeof URLS;

const cache = new Map<string, THREE.Texture>();

// 立即返回纹理：解码完成前显示占位贴图，完成后原地替换；低画质档缩到 1024 宽
export function planetTexture(which: Planet, tier: Tier, placeholder: () => THREE.Texture): THREE.Texture {
  const key = `${which}:${tier === 'low' ? 'low' : 'hi'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = placeholder();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = tier === 'high' ? 8 : 4;
  cache.set(key, tex);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    let source: CanvasImageSource = img;
    if (tier === 'low' && img.width > 1024) {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 512;
      c.getContext('2d')!.drawImage(img, 0, 0, 1024, 512);
      source = c;
    }
    tex.image = source;
    tex.needsUpdate = true;
  };
  img.src = URLS[which];
  return tex;
}

// 贴图坐标对应的经纬度 → 球面位置（与 THREE.SphereGeometry 的 UV 一致：u=0 对应西经 180°）
export function latLonToVec(latDeg: number, lonDeg: number, r: number): THREE.Vector3 {
  const phi = ((lonDeg + 180) / 360) * Math.PI * 2;
  const theta = THREE.MathUtils.degToRad(90 - latDeg);
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}
