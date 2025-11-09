import type { ShadowRouteCollection } from '~/types'

export const routeDemoData: ShadowRouteCollection = {
  origin: {
    lat: 25.017825,
    lng: 121.531337,
  },
  destination: {
    lat: 25.021637,
    lng: 121.534436,
  },
  travel_mode: 'WALK',
  best_route_id: 'route_3',
  routes: [
    {
      route_id: 'route_1',
      encoded_polyline: 'khuwC{qwdVDE_@c@UIcDQPcDPwEDe@qIiAG@GEoFq@',
      distance_m: 682,
      duration: '568s',
      description: '新生南路三段86巷和新生南路三段',
      shadow_area_m2: 1794.0864071672986,
      shadow_length_m: 298.1784036315509,
      building_count: 838,
      shadow_polygon_count: 838,
      wkt: 'LINESTRING (121.53134 25.01782, 121.53137 25.01779, 121.53155 25.01795, 121.5316 25.01806, 121.53169 25.01888, 121.53251 25.01879, 121.53359 25.0187, 121.53378 25.01867, 121.53415 25.02036, 121.53414 25.0204, 121.53417 25.02044, 121.53442 25.02164)',
    },
    {
      route_id: 'route_2',
      encoded_polyline: 'khuwC{qwdVzD}Do@}@COL_BLo@sImAkIgAG@GEoFq@',
      distance_m: 794,
      duration: '658s',
      description: '新生南路三段',
      shadow_area_m2: 685.4199344310075,
      shadow_length_m: 114.86524093141259,
      building_count: 934,
      shadow_polygon_count: 934,
      wkt: 'LINESTRING (121.53134 25.01782, 121.53229 25.01688, 121.5326 25.01712, 121.53268 25.01714, 121.53316 25.01707, 121.5334 25.017, 121.53379 25.0187, 121.53415 25.02036, 121.53414 25.0204, 121.53417 25.02044, 121.53442 25.02164)',
    },
    {
      route_id: 'route_3',
      encoded_polyline: 'khuwC{qwdVED_@e@eBMwIg@aFYU?GDm@w@k@qASo@QsAEyAAkDnBT',
      distance_m: 788,
      duration: '664s',
      description: '羅斯福路三段283巷和辛亥路一段',
      shadow_area_m2: 3576.5078375344406,
      shadow_length_m: 583.6377057390231,
      building_count: 1097,
      shadow_polygon_count: 1097,
      wkt: 'LINESTRING (121.53134 25.01782, 121.53131 25.01785, 121.5315 25.01801, 121.53157 25.01852, 121.53177 25.02024, 121.5319 25.02137, 121.5319 25.02148, 121.53187 25.02152, 121.53215 25.02175, 121.53256 25.02197, 121.5328 25.02207, 121.53322 25.02216, 121.53367 25.02219, 121.53453 25.0222, 121.53442 25.02164)',
    },
  ],
}
