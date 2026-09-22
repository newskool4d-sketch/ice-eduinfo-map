import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const provinceName = process.env.SOCIAL_PROVINCE_NAME ?? "전북특별자치도";
const shortName = process.env.SOCIAL_SHORT_NAME ?? "전북";
const siteHost = process.env.SOCIAL_SITE_HOST ?? "jb-edu-map.vercel.app";

const regions = JSON.parse(await readFile("public/data/regions.geojson", "utf8"));
const points = regions.features.flatMap(({ geometry }) =>
  geometry.type === "Polygon"
    ? geometry.coordinates.flat(1)
    : geometry.coordinates.flat(2),
);
const longitudes = points.map(([lng]) => lng);
const latitudes = points.map(([, lat]) => lat);
const bounds = {
  west: Math.min(...longitudes), east: Math.max(...longitudes),
  south: Math.min(...latitudes), north: Math.max(...latitudes),
};
const mapBox = { x: 727, y: 92, width: 376, height: 438 };
const scale = Math.min(
  mapBox.width / (bounds.east - bounds.west),
  mapBox.height / (bounds.north - bounds.south),
);
const project = ([lng, lat]) => [
  mapBox.x + (mapBox.width - (bounds.east - bounds.west) * scale) / 2 + (lng - bounds.west) * scale,
  mapBox.y + (mapBox.height - (bounds.north - bounds.south) * scale) / 2 + (bounds.north - lat) * scale,
];
const ringPath = (ring) => ring.map((point, index) => {
  const [x, y] = project(point);
  return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(" ") + " Z";
const palette = ["#f8d9c8", "#f3c5ad", "#f5d6bd", "#efb99e", "#eccab4", "#e8b399"];
const regionPaths = regions.features.map(({ geometry }, index) => {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const path = polygons.flatMap((polygon) => polygon.map(ringPath)).join(" ");
  return `<path d="${path}" fill="${palette[index % palette.length]}" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round" fill-rule="evenodd"/>`;
}).join("\n");
const sampleDots = regions.features.map(({ geometry }, index) => {
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0][0];
  const center = ring.reduce(([x, y], [lng, lat]) => [x + lng / ring.length, y + lat / ring.length], [0, 0]);
  const [x, y] = project(center);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index % 3 === 0 ? 6 : 4.5}" fill="#bb4b28" stroke="#ffffff" stroke-width="2.5"/>`;
}).join("\n");

const mark = `<rect width="64" height="64" rx="18" fill="#d9572b"/>
<path d="M32 12c-10.5 0-19 8.5-19 19 0 14.4 19 27 19 27s19-12.6 19-27c0-10.5-8.5-19-19-19Z" fill="#fff"/>
<circle cx="32" cy="31" r="8" fill="#d9572b"/>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${mark}</svg>`;
await writeFile("src/app/icon.svg", icon);
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile("src/app/apple-icon.png");
const iconSizes = [16, 32, 48, 64];
const iconImages = await Promise.all(iconSizes.map((size) =>
  sharp(Buffer.from(icon)).resize(size, size).png().toBuffer(),
));
const icoHeader = Buffer.alloc(6 + iconSizes.length * 16);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(iconSizes.length, 4);
let icoOffset = icoHeader.length;
iconImages.forEach((bytes, index) => {
  const entry = 6 + index * 16;
  icoHeader.writeUInt8(iconSizes[index], entry);
  icoHeader.writeUInt8(iconSizes[index], entry + 1);
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(bytes.length, entry + 8);
  icoHeader.writeUInt32LE(icoOffset, entry + 12);
  icoOffset += bytes.length;
});
await writeFile("src/app/favicon.ico", Buffer.concat([icoHeader, ...iconImages]));

const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#f6f7f8"/>
<rect x="0" y="0" width="1200" height="10" fill="#d9572b"/>
<circle cx="941" cy="318" r="278" fill="#fbe9df"/>
<circle cx="941" cy="318" r="225" fill="#fff7f1"/>
<g transform="translate(76 70)">${mark}</g>
<text x="156" y="109" fill="#a63d17" font-size="27" font-weight="700" font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif">${provinceName} 교육 데이터 지도</text>
<text x="76" y="254" fill="#1c2331" font-size="85" font-weight="700" letter-spacing="-4" font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif">${shortName}교육지도</text>
<text x="80" y="325" fill="#5b6472" font-size="31" font-weight="500" font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif">우리 지역의 학교와 교육 현황을</text>
<text x="80" y="369" fill="#5b6472" font-size="31" font-weight="500" font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif">지도에서 살펴보세요</text>
<rect x="78" y="430" width="324" height="59" rx="29.5" fill="#fff" stroke="#e7dcd7" stroke-width="2"/>
<text x="109" y="469" fill="#a63d17" font-size="25" font-weight="700" font-family="Noto Sans CJK KR, Apple SD Gothic Neo, sans-serif">학교 · 통계 · 교육문제</text>
<text x="80" y="568" fill="#7b8491" font-size="23" font-weight="500" font-family="Arial, sans-serif">${siteHost}</text>
<g>${regionPaths}${sampleDots}</g>
</svg>`;
await writeFile("public/social-preview.svg", preview);
await sharp(Buffer.from(preview)).png({ compressionLevel: 9 }).toFile("public/social-preview.png");
