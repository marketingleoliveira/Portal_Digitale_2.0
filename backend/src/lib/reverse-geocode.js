const cache = new Map();

export async function reverseGeocode(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("invalid_coordinates");
  }

  const key =
    latitude.toFixed(4) +
    "," +
    longitude.toFixed(4);

  const cached = cache.get(key);

  if (
    cached &&
    Date.now() - cached.at <
      24 * 60 * 60 * 1000
  ) {
    return cached.data;
  }

  const url =
    "https://nominatim.openstreetmap.org/reverse" +
    "?format=jsonv2" +
    "&lat=" +
    encodeURIComponent(latitude) +
    "&lon=" +
    encodeURIComponent(longitude) +
    "&addressdetails=1" +
    "&accept-language=pt-BR";

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "PortalDigitale/1.0 (digitaletextil.com.br)",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(
      "reverse_geocode_failed"
    );
  }

  const result = await response.json();
  const address = result?.address || {};

  const data = {
    city:
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      "Unknown",
    region:
      address.state ||
      address.region ||
      "Unknown",
    country:
      address.country ||
      "Unknown",
    neighborhood:
      address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      "",
    street:
      address.road ||
      address.pedestrian ||
      address.footway ||
      ""
  };

  cache.set(key, {
    at: Date.now(),
    data
  });

  return data;
}
