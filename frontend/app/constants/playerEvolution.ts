export interface PlayerEvolutionStage {
  id: string
  label: string
  minPoints: number
  sprite: {
    src: string
    width: number
    height: number
  }
  largeSprite: {
    src: string
  }
}

function resolveSprite(path: string) {
  return new URL(`../assets/images/${path}`, import.meta.url).href
}

const PLAYER_EVOLUTION_SPRITE_SCALE = 1.5

export const PLAYER_EVOLUTION_STAGES: PlayerEvolutionStage[] = [
  {
    id: 'base',
    label: '蝠寶寶',
    minPoints: 0,
    sprite: {
      src: resolveSprite('bat-64.png'),
      width: 64 * PLAYER_EVOLUTION_SPRITE_SCALE,
      height: 57 * PLAYER_EVOLUTION_SPRITE_SCALE,
    },
    largeSprite: {
      src: resolveSprite('bat-64-lg.png'),
    },
  },
  {
    id: 'evo1',
    label: '圓滾蝠',
    minPoints: 50,
    sprite: {
      src: resolveSprite('bat-evo.png'),
      width: 80 * PLAYER_EVOLUTION_SPRITE_SCALE,
      height: 71 * PLAYER_EVOLUTION_SPRITE_SCALE,
    },
    largeSprite: {
      src: resolveSprite('bat-evo-lg.png'),
    },
  },
  {
    id: 'evo2',
    label: '肥蝠俠',
    minPoints: 100,
    sprite: {
      src: resolveSprite('bat-evo2.png'),
      width: 80 * PLAYER_EVOLUTION_SPRITE_SCALE,
      height: 71 * PLAYER_EVOLUTION_SPRITE_SCALE,
    },
    largeSprite: {
      src: resolveSprite('bat-evo2-lg.png'),
    },
  },
  {
    id: 'evo3',
    label: '肥蝠法師',
    minPoints: 150,
    sprite: {
      src: resolveSprite('bat-evo3.png'),
      width: 96 * PLAYER_EVOLUTION_SPRITE_SCALE,
      height: 85 * PLAYER_EVOLUTION_SPRITE_SCALE,
    },
    largeSprite: {
      src: resolveSprite('bat-evo3-lg.png'),
    },
  },
  {
    id: 'evo4',
    label: '德古拉蝠',
    minPoints: 200,
    sprite: {
      src: resolveSprite('bat-evo4.png'),
      width: 96 * PLAYER_EVOLUTION_SPRITE_SCALE,
      height: 85 * PLAYER_EVOLUTION_SPRITE_SCALE,
    },
    largeSprite: {
      src: resolveSprite('bat-evo4-lg.png'),
    },
  },
]
