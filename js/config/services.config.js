const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const localServiceBaseUrls = {
  auth: ["http://localhost:5101/api/v1"],
  directory: ["http://localhost:5102/api"],
  catalog: ["http://localhost:5103/api/v1"],
  scheduling: ["http://localhost:5104/api/v1"],
  order: ["http://localhost:5105/api/v1"],
  clinical: [],
  hl7Gateway: []
};

const proxiedServiceBaseUrls = {
  auth: ["/api/auth"],
  directory: ["/api/directory"],
  catalog: ["/api/catalog"],
  scheduling: ["/api/scheduling"],
  order: ["/api/order"],
  clinical: [],
  hl7Gateway: []
};

export const SERVICE_BASE_URLS = window.__HYGEA_SERVICE_BASE_URLS || (isLocalHost
  ? localServiceBaseUrls
  : proxiedServiceBaseUrls);
