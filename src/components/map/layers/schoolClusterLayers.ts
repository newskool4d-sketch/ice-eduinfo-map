import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { SchoolCluster } from "../schoolClusters";

export function makeSchoolClusterLayers(
  clusters: SchoolCluster[],
  onClick: (cluster: SchoolCluster) => void,
  dark: boolean,
  large: boolean,
) {
  return [
    new ScatterplotLayer<SchoolCluster>({
      id: "school-clusters",
      data: clusters,
      getPosition: (cluster) => cluster.position,
      billboard: true,
      radiusUnits: "pixels",
      getRadius: large ? 22 : 20,
      getFillColor: dark ? [214, 233, 242, 255] : [38, 66, 84, 255],
      stroked: true,
      getLineColor: dark ? [38, 66, 84, 255] : [255, 255, 255, 255],
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      pickable: true,
      onClick: ({ object }) => { if (object) onClick(object); return true; },
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
    new TextLayer<SchoolCluster>({
      id: "school-cluster-counts",
      data: clusters,
      getPosition: (cluster) => cluster.position,
      getText: (cluster) => String(cluster.schools.length),
      getSize: large ? 17 : 15,
      getColor: dark ? [22, 43, 56, 255] : [255, 255, 255, 255],
      fontFamily: "Arial, sans-serif",
      fontWeight: 700,
      characterSet: "0123456789",
      billboard: true,
      pickable: false,
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
  ];
}
