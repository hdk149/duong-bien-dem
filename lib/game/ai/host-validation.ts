import type { ValidatedAIHostResponse } from "./validate";

export type ExpectedPlayer = {
  id: string;
};

export function validateAIPlayers(
  response: ValidatedAIHostResponse,
  expectedPlayers: ExpectedPlayer[]
): void {
  const expectedIds = new Set(
    expectedPlayers.map((player) => player.id)
  );

  const returnedIds = response.players.map(
    (player) => player.player_id
  );

  if (returnedIds.length !== expectedIds.size) {
    throw new Error(
      `AI returned ${returnedIds.length} players, expected ${expectedIds.size}.`
    );
  }

  const uniqueReturnedIds = new Set(returnedIds);

  if (
    uniqueReturnedIds.size !==
    returnedIds.length
  ) {
    throw new Error(
      "AI returned duplicate player_id values."
    );
  }

  for (const playerId of returnedIds) {
    if (!expectedIds.has(playerId)) {
      throw new Error(
        `AI returned unknown player_id: ${playerId}`
      );
    }
  }

  for (const expectedId of expectedIds) {
    if (!uniqueReturnedIds.has(expectedId)) {
      throw new Error(
        `AI did not return player_id: ${expectedId}`
      );
    }
  }
}