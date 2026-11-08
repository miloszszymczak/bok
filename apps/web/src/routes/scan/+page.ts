// Camera, IndexedDB and the decoder only exist in the browser; render client-side so the
// page also works from the service-worker cache when offline.
export const ssr = false;
