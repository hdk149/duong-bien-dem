export type AIChoice = {
  id: string;
  text: string;
};

export type AIEvent = {
  title: string;
  description: string;
  type: string;
  choices: AIChoice[];
  destination?: string | null;
};

export type AIPlayerEffects = {
  hp?: number;
  money?: number;
  location?: string;
  legal_risk?: number;
};

export type AIPlayerResult = {
  player_id: string;

  event: AIEvent;

  effects: AIPlayerEffects;
};

export type AIHostResponse = {
  round: number;

  players: AIPlayerResult[];
};