/** SPEC §6.4 の配色。ここ以外に色リテラルを書かない。 */

export const PALETTE = {
  background: "#1B1917",
  /** ステージ外側の余白（カメラのレターボックス部分）。 */
  letterbox: "#131110",

  tile: "#2E2A26",
  tileTop: "#3D3833",

  gateClosed: "#7A5C4A",

  /** 押せる箱。ゲート(#7A5C4A)と混同しないよう一段明るくする。 */
  crate: "#8A6B4F",
  crateEdge: "#A88463",
  gateOpen: "#7A5C4A",

  accent: "#E3B341",
  signalOn: "#F0E5D8",

  textPrimary: "#F0E5D8",
  textDim: "#8A8078",
} as const;

/** Clawd 1体分の色。P1/P2 は形は同一で色だけが違う (SPEC §6.3)。 */
export interface PlayerPalette {
  body: string;
  bodyDark: string;
  bodyLight: string;
  eye: string;
  shadow: string;
}

/** P1: Anthropic のクレイオレンジ。 */
export const P1_PALETTE: PlayerPalette = {
  body: "#D97757",
  bodyDark: "#B25A3E",
  bodyLight: "#E8977C",
  eye: "#2A211C",
  shadow: "rgba(217, 119, 87, 0.35)",
};

/** P2: 同じ形で色相をずらした青緑。 */
export const P2_PALETTE: PlayerPalette = {
  body: "#57A8D9",
  bodyDark: "#3E80B2",
  bodyLight: "#7CC2E8",
  eye: "#1C242A",
  shadow: "rgba(87, 168, 217, 0.35)",
};

export const PLAYER_PALETTES: readonly PlayerPalette[] = [P1_PALETTE, P2_PALETTE];

export function paletteForPlayer(index: number): PlayerPalette {
  return PLAYER_PALETTES[index % PLAYER_PALETTES.length]!;
}
