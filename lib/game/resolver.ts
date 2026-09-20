import type {
  EventData,
  Player,
  PlayerVote,
  VoteProgress,
} from "./types";

import {
  getVoteProgress,
} from "./vote";

/* =========================
   RESOLVER TYPES
   ========================= */

export type ResolveStatus =
  | "waiting"
  | "ready";

export type ResolveCheck = {
  status: ResolveStatus;
  progress: VoteProgress;
};

export type ResolvedVote = {
  player: Player;
  vote: PlayerVote;
};

export type ResolveInput = {
  event: EventData;
  players: Player[];
  votes: PlayerVote[];
};

/* =========================
   ACTIVE PLAYERS
   ========================= */

/**
 * Chỉ player đang thực sự tham gia
 * game mới được tính vào vote.
 *
 * Host:
 *   - vẫn là participant
 *   - vẫn phải vote
 *
 * Player:
 *   - vẫn là participant
 *
 * Spectator:
 *   - không vote
 *
 * Kicked / banned:
 *   - không vote
 *
 * Resolver không query database.
 * Nó chỉ lọc dữ liệu players được truyền vào.
 */
function getActivePlayers(
  players: Player[]
): Player[] {
  return players.filter(
    (player) => {
      /*
       * Spectator không tham gia vote.
       */
      if (
        player.role ===
        "spectator"
      ) {
        return false;
      }

      /*
       * moderation_status có thể chưa
       * nằm trong Player type hiện tại.
       *
       * Vì vậy đọc an toàn bằng
       * intersection type.
       */
      const playerWithModeration =
        player as Player & {
          moderation_status?: string;
        };

      const moderationStatus =
        playerWithModeration
          .moderation_status;

      /*
       * Nếu có moderation_status
       * thì bắt buộc phải là active.
       *
       * Nếu field chưa tồn tại trên
       * object thì giữ nguyên behavior
       * cũ để không phá type/runtime.
       */
      if (
        moderationStatus &&
        moderationStatus !==
          "active"
      ) {
        return false;
      }

      return true;
    }
  );
}

/* =========================
   GET ACTIVE PLAYER IDS
   ========================= */

export function getActivePlayerIds(
  players: Player[]
): string[] {
  return getActivePlayers(
    players
  ).map(
    (player) =>
      player.id
  );
}

/* =========================
   CHECK RESOLVE
   ========================= */

/**
 * Kiểm tra event đã đủ người vote chưa.
 *
 * totalPlayers được tính từ
 * ACTIVE players thực tế.
 *
 * Không dùng max_players.
 */
export function checkResolve(
  players: Player[],
  votes: PlayerVote[]
): ResolveCheck {
  const activePlayers =
    getActivePlayers(
      players
    );

  const progress =
    getVoteProgress(
      activePlayers,
      votes
    );

  if (
    progress.allPlayersChosen
  ) {
    return {
      status: "ready",
      progress,
    };
  }

  return {
    status: "waiting",
    progress,
  };
}

/* =========================
   CAN RESOLVE
   ========================= */

export function canResolve(
  players: Player[],
  votes: PlayerVote[]
): boolean {
  return (
    checkResolve(
      players,
      votes
    ).status ===
    "ready"
  );
}

/* =========================
   GET VALID VOTES
   ========================= */

/**
 * Chỉ lấy vote của ACTIVE players.
 *
 * Host cũng được tính.
 *
 * Mỗi player chỉ được tính một vote.
 */
export function getResolvedVotes(
  players: Player[],
  votes: PlayerVote[]
): ResolvedVote[] {
  const activePlayers =
    getActivePlayers(
      players
    );

  const playerMap =
    new Map<string, Player>();

  for (
    const player of activePlayers
  ) {
    playerMap.set(
      player.id,
      player
    );
  }

  const resolved: ResolvedVote[] =
    [];

  const processedPlayers =
    new Set<string>();

  for (
    const vote of votes
  ) {
    /*
     * Một player chỉ được tính
     * một vote.
     */
    if (
      processedPlayers.has(
        vote.player_id
      )
    ) {
      continue;
    }

    /*
     * Vote phải thuộc về ACTIVE
     * player hiện tại.
     */
    const player =
      playerMap.get(
        vote.player_id
      );

    if (!player) {
      continue;
    }

    processedPlayers.add(
      vote.player_id
    );

    resolved.push({
      player,
      vote,
    });
  }

  return resolved;
}

/* =========================
   VALIDATE EVENT
   ========================= */

export function isEventResolvable(
  event: EventData,
  sessionId: string,
  round: number
): boolean {
  if (
    event.session_id &&
    event.session_id !==
      sessionId
  ) {
    return false;
  }

  if (
    event.round !==
    round
  ) {
    return false;
  }

  return true;
}

/* =========================
   RESOLVE EVENT
   ========================= */

export function prepareResolve(
  input: ResolveInput
): {
  event: EventData;
  progress: VoteProgress;
  votes: ResolvedVote[];
} | null {
  const {
    event,
    players,
    votes,
  } = input;

  /*
   * Lọc ACTIVE players ngay tại
   * resolver boundary.
   */
  const activePlayers =
    getActivePlayers(
      players
    );

  /*
   * Tính progress bằng ACTIVE
   * players בלבד.
   */
  const progress =
    getVoteProgress(
      activePlayers,
      votes
    );

  /*
   * Chưa đủ vote.
   */
  if (
    !progress.allPlayersChosen
  ) {
    return null;
  }

  /*
   * Lấy vote hợp lệ.
   */
  const resolvedVotes =
    getResolvedVotes(
      activePlayers,
      votes
    );

  /*
   * Safety check.
   *
   * Vote hợp lệ phải bằng đúng
   * số ACTIVE players.
   */
  if (
    resolvedVotes.length !==
    progress.totalPlayers
  ) {
    return null;
  }

  return {
    event,

    progress,

    votes:
      resolvedVotes,
  };
}