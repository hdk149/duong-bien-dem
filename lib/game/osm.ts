export type OSMCoordinates = {
  lat: number;
  lon: number;
  displayName: string;
};

export async function geocodeLocation(
  location: string
): Promise<OSMCoordinates | null> {
  const query = location.trim();

  if (!query) {
    return null;
  }

  const url = new URL(
    "https://nominatim.openstreetmap.org/search"
  );

  url.searchParams.set(
    "q",
    query
  );

  url.searchParams.set(
    "format",
    "jsonv2"
  );

  url.searchParams.set(
    "limit",
    "1"
  );

  try {
    const response =
      await fetch(
        url.toString(),
        {
          headers: {
            Accept:
              "application/json",
            "User-Agent":
              "DuongBienDem/1.0",
          },
          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    if (
      !Array.isArray(data) ||
      data.length === 0
    ) {
      return null;
    }

    const result =
      data[0];

    const lat =
      Number(result.lat);

    const lon =
      Number(result.lon);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }

    return {
      lat,
      lon,
      displayName:
        typeof result.display_name ===
        "string"
          ? result.display_name
          : query,
    };
  } catch {
    return null;
  }
}