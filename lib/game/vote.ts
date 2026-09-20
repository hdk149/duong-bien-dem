import type {
  Player,
  PlayerVote,
  VoteProgress,
} from "./types";

/**
 * Lấy danh sách những người THỰC SỰ phải chơi/vote.
 *
 * Host cũng là người chơi.
 * Player cũng là người chơi.
 * Chỉ spectator mới bị loại.
 */
export function getRoomPlayers(
  players: Player[]
): Player[] {
  return players.filter(
    (player) =>
      player.role !== "spectator"
  );
}

/**
 * Đếm số người đã vote cho event hiện tại.
 *
 * Mỗi người chơi chỉ được tính 1 lần.
 *
 * Host + player đều được tính.
 * Spectator không được tính.
 */
export function getVoteProgress(
  players: Player[],
  votes: PlayerVote[]
): VoteProgress {
  const roomPlayers =
    getRoomPlayers(players);

  const playerIds = new Set(
    roomPlayers.map(
      (player) => player.id
    )
  );

  const chosenPlayerIds =
    new Set<string>();

  for (const vote of votes) {
    if (
      !playerIds.has(
        vote.player_id
      )
    ) {
      continue;
    }

    chosenPlayerIds.add(
      vote.player_id
    );
  }

  const totalPlayers =
    roomPlayers.length;

  const chosenPlayers =
    chosenPlayerIds.size;

  return {
    chosenPlayers,
    totalPlayers,
    allPlayersChosen:
      totalPlayers > 0 &&
      chosenPlayers ===
        totalPlayers,
  };
}

/**
 * Kiểm tra tất cả người chơi
 * đã vote hay chưa.
 */
export function hasEveryoneVoted(
  players: Player[],
  votes: PlayerVote[]
): boolean {
  return getVoteProgress(
    players,
    votes
  ).allPlayersChosen;
}