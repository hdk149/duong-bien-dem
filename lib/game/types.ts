export type Choice = {
  id: string;
  title: string;
  description: string;
};

export type GameEvent = {
  id: string;
  round: number;
  title: string;
  description: string;
  question: string;
  choices: Choice[];
};

export type ChoiceResult = {
  moneyChange: number;
  hpChange: number;
  location?: string;
  message: string;
};

/* =========================
   REAL BACKEND GAME TYPES
   ========================= */

export type BackendChoice = {
  id?: string;
  choice_id?: string;
  title?: string;
  label?: string;
  description?: string;
  text?: string;
};

export type EventData = {
  id: string;
  room_id: string;
  session_id?: string | null;
  round: number;
  title: string;
  description: string;
  question?: string | null;
  event_type: string;
  choices: BackendChoice[];
  result?: unknown;
};

export type Player = {
  id: string;
  player_name: string;
  role: string;
  hp: number;
  money: number;
  location: string;
  legal_risk: number;
  is_connected: boolean;
  last_choice: string | null;
};

export type CurrentPlayer = {
  id: string;
  player_name: string;
  role: string;
  hp: number;
  money: number;
  location: string;
  is_connected: boolean;
  last_choice: string | null;
};

export type GameState = {
  id: string;
  room_id: string;
  session_id?: string | null;
  round: number;
  phase: string;
  current_event_id: string | null;
  started_at: string | null;
  updated_at: string | null;
};

export type Session = {
  id: string;
  room_id: string;
  session_number: number;
  status: string;
  round: number;
  phase: string;
  started_at: string | null;
};

export type GameRoom = {
  id: string;
  code: string;
  host_name: string;
  max_players: number;
  status: string;
  starting_money?: number;
  goal_money?: number;
  starting_location?: string;
  dice_system?: unknown;
};

export type GameResponse = {
  room: GameRoom;
  session?: Session | null;
  gameState: GameState;
  currentEvent: EventData | null;
  currentPlayer: CurrentPlayer;
  players: Player[];
};

/* =========================
   VOTE TYPES
   ========================= */

export type VoteProgress = {
  chosenPlayers: number;
  totalPlayers: number;
  allPlayersChosen: boolean;
};

export type PlayerVote = {
  player_id: string;
  choice_id: string;
};