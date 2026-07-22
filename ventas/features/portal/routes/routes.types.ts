export type RouteEditor = {
  vehicleId: string;
  originLabel: string;
  originLatitude: string;
  originLongitude: string;
  destinationLabel: string;
  destinationLatitude: string;
  destinationLongitude: string;
};

export function createBlankEditor(vehicleId = ''): RouteEditor {
  return {
    vehicleId,
    originLabel: '',
    originLatitude: '',
    originLongitude: '',
    destinationLabel: '',
    destinationLatitude: '',
    destinationLongitude: '',
  };
}
