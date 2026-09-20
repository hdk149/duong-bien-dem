import type { Player } from "./types";
import { geocodeLocation } from "./osm";

export type LocationLeak = {
  playerId: string;
  playerName: string;
  location: string;
  lat: number;
  lon: number;
};

export function shouldLeakLocation(
  round: number
): boolean {
  return (
    Number.isInteger(round) &&
    round > 0 &&
    round % 5 === 0
  );
}

export async function buildLocationLeak(
  players: Player[]
): Promise<LocationLeak[]> {
  const voters =
    players.filter(
      (player) =>
        player.role === "host" ||
        player.role === "player"
    );

  const results: LocationLeak[] = [];

  for (const player of voters) {
    const coordinates =
      await geocodeLocation(
        player.location
      );

    if (!coordinates) {
      console.warn(
        `OSM could not find location: ${player.location}`
      );

      continue;
    }

    results.push({
      playerId: player.id,
      playerName:
        player.player_name,
      location:
        player.location,
      lat: coordinates.lat,
      lon: coordinates.lon,
    });
  }

  return results;
}