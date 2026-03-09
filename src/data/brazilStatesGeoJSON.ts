// Simplified GeoJSON of Brazilian states for map highlighting
// Source: IBGE simplified boundaries

export interface BrazilStateFeature {
  type: "Feature";
  properties: {
    sigla: string;
    nome: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface BrazilStatesGeoJSON {
  type: "FeatureCollection";
  features: BrazilStateFeature[];
}

// State boundaries (simplified for performance)
// These are approximate center-based polygons for visualization
export const BRAZIL_STATES_SIMPLIFIED: BrazilStatesGeoJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { sigla: "AC", nome: "Acre" }, geometry: { type: "Polygon", coordinates: [[[-73.99, -7.12], [-66.81, -7.12], [-66.81, -11.15], [-73.99, -11.15], [-73.99, -7.12]]] }},
    { type: "Feature", properties: { sigla: "AL", nome: "Alagoas" }, geometry: { type: "Polygon", coordinates: [[[-38.23, -8.81], [-35.16, -8.81], [-35.16, -10.50], [-38.23, -10.50], [-38.23, -8.81]]] }},
    { type: "Feature", properties: { sigla: "AP", nome: "Amapá" }, geometry: { type: "Polygon", coordinates: [[[-54.87, 4.44], [-49.87, 4.44], [-49.87, -1.23], [-54.87, -1.23], [-54.87, 4.44]]] }},
    { type: "Feature", properties: { sigla: "AM", nome: "Amazonas" }, geometry: { type: "Polygon", coordinates: [[[-73.79, 2.25], [-56.10, 2.25], [-56.10, -9.82], [-73.79, -9.82], [-73.79, 2.25]]] }},
    { type: "Feature", properties: { sigla: "BA", nome: "Bahia" }, geometry: { type: "Polygon", coordinates: [[[-46.62, -8.53], [-37.34, -8.53], [-37.34, -18.35], [-46.62, -18.35], [-46.62, -8.53]]] }},
    { type: "Feature", properties: { sigla: "CE", nome: "Ceará" }, geometry: { type: "Polygon", coordinates: [[[-41.42, -2.78], [-37.25, -2.78], [-37.25, -7.87], [-41.42, -7.87], [-41.42, -2.78]]] }},
    { type: "Feature", properties: { sigla: "DF", nome: "Distrito Federal" }, geometry: { type: "Polygon", coordinates: [[[-48.29, -15.50], [-47.31, -15.50], [-47.31, -16.05], [-48.29, -16.05], [-48.29, -15.50]]] }},
    { type: "Feature", properties: { sigla: "ES", nome: "Espírito Santo" }, geometry: { type: "Polygon", coordinates: [[[-41.88, -17.89], [-39.68, -17.89], [-39.68, -21.30], [-41.88, -21.30], [-41.88, -17.89]]] }},
    { type: "Feature", properties: { sigla: "GO", nome: "Goiás" }, geometry: { type: "Polygon", coordinates: [[[-53.25, -12.39], [-45.91, -12.39], [-45.91, -19.50], [-53.25, -19.50], [-53.25, -12.39]]] }},
    { type: "Feature", properties: { sigla: "MA", nome: "Maranhão" }, geometry: { type: "Polygon", coordinates: [[[-48.77, -1.04], [-41.79, -1.04], [-41.79, -10.26], [-48.77, -10.26], [-48.77, -1.04]]] }},
    { type: "Feature", properties: { sigla: "MT", nome: "Mato Grosso" }, geometry: { type: "Polygon", coordinates: [[[-61.63, -7.35], [-50.22, -7.35], [-50.22, -18.04], [-61.63, -18.04], [-61.63, -7.35]]] }},
    { type: "Feature", properties: { sigla: "MS", nome: "Mato Grosso do Sul" }, geometry: { type: "Polygon", coordinates: [[[-58.17, -17.17], [-53.26, -17.17], [-53.26, -24.07], [-58.17, -24.07], [-58.17, -17.17]]] }},
    { type: "Feature", properties: { sigla: "MG", nome: "Minas Gerais" }, geometry: { type: "Polygon", coordinates: [[[-51.04, -14.24], [-39.86, -14.24], [-39.86, -22.92], [-51.04, -22.92], [-51.04, -14.24]]] }},
    { type: "Feature", properties: { sigla: "PA", nome: "Pará" }, geometry: { type: "Polygon", coordinates: [[[-58.90, 2.59], [-46.06, 2.59], [-46.06, -9.83], [-58.90, -9.83], [-58.90, 2.59]]] }},
    { type: "Feature", properties: { sigla: "PB", nome: "Paraíba" }, geometry: { type: "Polygon", coordinates: [[[-38.77, -6.02], [-34.79, -6.02], [-34.79, -8.30], [-38.77, -8.30], [-38.77, -6.02]]] }},
    { type: "Feature", properties: { sigla: "PR", nome: "Paraná" }, geometry: { type: "Polygon", coordinates: [[[-54.62, -22.52], [-48.02, -22.52], [-48.02, -26.72], [-54.62, -26.72], [-54.62, -22.52]]] }},
    { type: "Feature", properties: { sigla: "PE", nome: "Pernambuco" }, geometry: { type: "Polygon", coordinates: [[[-41.36, -7.16], [-34.81, -7.16], [-34.81, -9.49], [-41.36, -9.49], [-41.36, -7.16]]] }},
    { type: "Feature", properties: { sigla: "PI", nome: "Piauí" }, geometry: { type: "Polygon", coordinates: [[[-45.99, -2.74], [-40.37, -2.74], [-40.37, -10.93], [-45.99, -10.93], [-45.99, -2.74]]] }},
    { type: "Feature", properties: { sigla: "RJ", nome: "Rio de Janeiro" }, geometry: { type: "Polygon", coordinates: [[[-44.89, -20.76], [-40.96, -20.76], [-40.96, -23.37], [-44.89, -23.37], [-44.89, -20.76]]] }},
    { type: "Feature", properties: { sigla: "RN", nome: "Rio Grande do Norte" }, geometry: { type: "Polygon", coordinates: [[[-38.58, -4.83], [-34.97, -4.83], [-34.97, -6.98], [-38.58, -6.98], [-38.58, -4.83]]] }},
    { type: "Feature", properties: { sigla: "RS", nome: "Rio Grande do Sul" }, geometry: { type: "Polygon", coordinates: [[[-57.64, -27.08], [-49.69, -27.08], [-49.69, -33.75], [-57.64, -33.75], [-57.64, -27.08]]] }},
    { type: "Feature", properties: { sigla: "RO", nome: "Rondônia" }, geometry: { type: "Polygon", coordinates: [[[-66.80, -7.97], [-59.77, -7.97], [-59.77, -13.69], [-66.80, -13.69], [-66.80, -7.97]]] }},
    { type: "Feature", properties: { sigla: "RR", nome: "Roraima" }, geometry: { type: "Polygon", coordinates: [[[-64.82, 5.27], [-58.88, 5.27], [-58.88, -1.58], [-64.82, -1.58], [-64.82, 5.27]]] }},
    { type: "Feature", properties: { sigla: "SC", nome: "Santa Catarina" }, geometry: { type: "Polygon", coordinates: [[[-53.84, -25.95], [-48.35, -25.95], [-48.35, -29.35], [-53.84, -29.35], [-53.84, -25.95]]] }},
    { type: "Feature", properties: { sigla: "SP", nome: "São Paulo" }, geometry: { type: "Polygon", coordinates: [[[-53.11, -19.78], [-44.16, -19.78], [-44.16, -25.31], [-53.11, -25.31], [-53.11, -19.78]]] }},
    { type: "Feature", properties: { sigla: "SE", nome: "Sergipe" }, geometry: { type: "Polygon", coordinates: [[[-38.25, -9.52], [-36.39, -9.52], [-36.39, -11.57], [-38.25, -11.57], [-38.25, -9.52]]] }},
    { type: "Feature", properties: { sigla: "TO", nome: "Tocantins" }, geometry: { type: "Polygon", coordinates: [[[-50.72, -5.17], [-45.73, -5.17], [-45.73, -13.47], [-50.72, -13.47], [-50.72, -5.17]]] }},
  ],
};
