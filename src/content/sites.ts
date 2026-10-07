import type { SiteId } from '../core/types';

export interface SiteDef {
  id: SiteId;
  name: string;
  coord: string;
  latDeg: number;
  elevationKm: number; // 相对 MOLA 基准面
  solarFactor: number; // 纬度导致的平均光照系数
  ice: number; // 提水产量系数
  science: number; // 科研乘数
  edlRisk: number; // 着陆风险基数
  tagline: string;
  pros: string[];
  cons: string[];
  basis: string;
  profile: number[]; // 示意高程剖面（km），供 UI 与地形生成使用
  profileKm: number; // 剖面横向跨度
}

export const SITES: SiteDef[] = [
  { id: 'utopia', name: '乌托邦平原', coord: '25.1°N 109.9°E', latDeg: 25.1, elevationKm: -4.1,
    solarFactor: 0.85, ice: 0.6, science: 1.15, edlRisk: 0.06,
    tagline: '祝融号的家：平坦、稳妥',
    pros: ['地形平坦，着陆最安全', '低海拔，大气更厚，减速更充分', '中等地下冰'],
    cons: ['科研多样性一般'],
    basis: '祝融号 2021 年着陆于乌托邦平原南部，次表层雷达探测到分层结构。',
    profile: [-4.02, -4.05, -4.1, -4.08, -4.12, -4.1, -4.15, -4.1, -4.09, -4.12, -4.1, -4.08], profileKm: 40 },
  { id: 'jezero', name: '杰泽罗撞击坑', coord: '18.4°N 77.5°E', latDeg: 18.4, elevationKm: -2.6,
    solarFactor: 0.9, ice: 0.3, science: 1.3, edlRisk: 0.2,
    tagline: '古三角洲：科学价值最高',
    pros: ['古湖泊与河流三角洲', '可能保存古代生命痕迹', '光照最好'],
    cons: ['坑壁、悬崖与巨石区', '地下冰稀少'],
    basis: '毅力号 2021 年着陆杰泽罗坑，正在采集三角洲沉积岩样本。',
    profile: [-1.6, -1.8, -2.3, -2.55, -2.6, -2.5, -2.45, -2.6, -2.55, -2.2, -1.9, -1.5], profileKm: 45 },
  { id: 'arcadia', name: '阿卡迪亚平原', coord: '46.0°N 195.0°E', latDeg: 46.0, elevationKm: -3.6,
    solarFactor: 0.62, ice: 1.0, science: 1.2, edlRisk: 0.09,
    tagline: '冰原：资源最丰富',
    pros: ['浅层水冰距地表不到 1 米', '提水与推进剂生产最快'],
    cons: ['高纬度光照弱', '冬季极冷'],
    basis: 'SWIM 冰图显示阿卡迪亚平原中纬度存在浅层地下冰。',
    profile: [-3.5, -3.55, -3.6, -3.58, -3.62, -3.6, -3.64, -3.6, -3.57, -3.6, -3.63, -3.6], profileKm: 40 },
];

export const siteById = (id: string | null | undefined) => SITES.find((s) => s.id === id);
