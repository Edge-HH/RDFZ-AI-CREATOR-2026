import routes from "../data/routes.json";
export const ROUTES = routes;
export const getRoute = (id: string) => routes.find((route) => route.id === id);
export const routeMetrics = (id: string) => {
  const r = getRoute(id);
  return r ? { km: r.distance, maxSlope: r.slope } : undefined;
};
